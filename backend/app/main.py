from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from sqlalchemy import text

from app.config import get_settings
from app.core.database import engine, init_db
from app.core.exceptions import ClawScholarError, clawscholar_exception_handler
from app.core.logging import configure_logging, get_logger
from app.core.redis import close_redis, get_redis

logger = get_logger(__name__)


async def _run_migrations(*, repair_stamp_to: str | None = None) -> None:
    """Run Alembic migrations (head) on startup so new tables are always created."""
    import asyncio
    from alembic.config import Config
    from alembic import command

    def _sync():
        # Resolve relative to source file so it works in docker and local runs.
        alembic_ini = Path(__file__).resolve().parents[1] / "alembic.ini"
        cfg = Config(str(alembic_ini))
        if repair_stamp_to is not None:
            command.stamp(cfg, repair_stamp_to)
        command.upgrade(cfg, "head")
        logger.info("Alembic migrations applied")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    configure_logging()
    logger.info("ClawScholar starting up")

    settings = get_settings()
    await init_db()
    if settings.run_migrations_on_startup:
        # Self-heal dev DBs where alembic_version got stamped but tables weren't created.
        async with engine.begin() as conn:
            writing_runs_exists = (await conn.execute(text("SELECT to_regclass('public.writing_runs')"))).scalar()
            document_chunks_exists = (await conn.execute(text("SELECT to_regclass('public.document_chunks')"))).scalar()

        # If writing_runs is missing the DB is far behind — force re-run from 002.
        repair_stamp_to = "002" if writing_runs_exists is None else None
        await _run_migrations(repair_stamp_to=repair_stamp_to)

        # If document_chunks is still missing after the migration run (can happen when
        # alembic stamped the revision but the DDL failed silently), create it directly.
        if not document_chunks_exists:
            async with engine.begin() as conn:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS document_chunks (
                        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                        created_at timestamptz NOT NULL DEFAULT now(),
                        updated_at timestamptz NOT NULL DEFAULT now(),
                        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                        chunk_index integer NOT NULL,
                        content text NOT NULL,
                        embedding vector NOT NULL,
                        UNIQUE (document_id, chunk_index)
                    )
                """))
                await conn.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id "
                    "ON document_chunks (document_id)"
                ))
            logger.warning("document_chunks table was missing after migrations — repaired directly")
    logger.info("Database initialized")

    await get_redis()
    logger.info("Redis connected")

    yield

    await close_redis()
    logger.info("ClawScholar shutting down")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="ClawScholar API",
        description="Research-Grade Multi-Agent Academic Workflow Engine",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    cors_origins = settings.cors_origins
    # Starlette/FastAPI: allow_credentials=True cannot be combined with allow_origins=["*"].
    # In dev/docker we still want to allow any origin while supporting credentials,
    # so we switch to a regex that mirrors the request Origin.
    cors_middleware_kwargs: dict = {
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if "*" in cors_origins:
        cors_middleware_kwargs["allow_origin_regex"] = ".*"
        cors_middleware_kwargs["allow_origins"] = []
    else:
        cors_middleware_kwargs["allow_origins"] = cors_origins

    app.add_middleware(
        CORSMiddleware,
        **cors_middleware_kwargs,
    )

    app.add_exception_handler(ClawScholarError, clawscholar_exception_handler)  # type: ignore[arg-type]

    from app.api.v1.router import api_router
    from app.api.websocket import ws_router

    app.include_router(api_router, prefix="/api/v1")
    app.include_router(ws_router, prefix="/ws")

    return app
