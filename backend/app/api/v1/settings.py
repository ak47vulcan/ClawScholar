from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.api.deps import get_current_user, get_db
from app.models.user import User

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


class SettingsUpdate(BaseModel):
    settings: dict[str, Any]


@router.get("/")
async def get_settings_endpoint(user: CurrentUser) -> dict[str, Any]:
    return user.settings or {}


@router.put("/")
async def update_settings_endpoint(payload: SettingsUpdate, db: DB, user: CurrentUser) -> dict[str, Any]:
    user.settings = payload.settings
    await db.flush()
    return user.settings
