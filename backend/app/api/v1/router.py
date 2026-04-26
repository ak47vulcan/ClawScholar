from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.api.v1 import auth, goals, workflows, documents, agents, settings as settings_router, chat, schedule as schedule_router, projects as projects_router, writer as writer_router

api_router = APIRouter()


@api_router.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "clawscholar-api"})


api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects_router.router, prefix="/projects", tags=["projects"])
api_router.include_router(goals.router, prefix="/goals", tags=["goals"])
api_router.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(schedule_router.router, prefix="/schedule", tags=["schedule"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
api_router.include_router(settings_router.router, prefix="/settings", tags=["settings"])
api_router.include_router(writer_router.router, prefix="/writer", tags=["writer"])
