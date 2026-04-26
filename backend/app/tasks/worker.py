import urllib.parse

from arq.connections import RedisSettings

from app.config import get_settings
from app.tasks.embedding_tasks import index_document


async def startup(ctx: dict) -> None:
    pass


async def shutdown(ctx: dict) -> None:
    pass


class WorkerSettings:
    functions = [index_document]
    on_startup = startup
    on_shutdown = shutdown

    # NOTE: arq expects a class attribute (not a @property). If this is a property,
    # arq will receive a `property` object and crash at startup.
    _parsed = urllib.parse.urlparse(get_settings().redis_url)
    redis_settings = RedisSettings(
        host=_parsed.hostname or "localhost",
        port=_parsed.port or 6379,
        database=int((_parsed.path or "/0").lstrip("/") or "0"),
        password=_parsed.password,
    )
