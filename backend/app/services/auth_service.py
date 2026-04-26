"""Authentication service: JWT creation/validation, password hashing, OAuth2 flow."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AuthenticationError, ConflictError
from app.models.user import User
from app.schemas.user import UserCreate

log = structlog.get_logger(__name__)
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Return bcrypt hash of *plain*."""
    return _pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    return _pwd_ctx.verify(plain, hashed)


def create_access_token(payload: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Sign and return a JWT access token.

    Args:
        payload: Claims to embed (must include ``sub``).
        expires_delta: Optional override for expiry; defaults to settings value.

    Returns:
        Encoded JWT string.
    """
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.jwt_expiry_minutes))
    return jwt.encode({**payload, "exp": expire}, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str) -> str:
    """Return a long-lived refresh token (7 days)."""
    return create_access_token({"sub": user_id, "type": "refresh"}, timedelta(days=7))


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate *token*; raise AuthenticationError on failure.

    Args:
        token: Raw JWT string.

    Returns:
        Decoded payload dict.

    Raises:
        AuthenticationError: If token is invalid or expired.
    """
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired token") from exc


async def register_user(session: AsyncSession, data: UserCreate) -> User:
    """Create a new user account.

    Args:
        session: Active async DB session.
        data: Validated registration payload.

    Returns:
        Newly created User ORM instance.

    Raises:
        ConflictError: If the email is already registered.
    """
    existing = await session.scalar(select(User).where(User.email == data.email))
    if existing:
        raise ConflictError(f"Email {data.email!r} is already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    log.info("user.registered", user_id=str(user.id), email=user.email)
    return user


async def authenticate_user(session: AsyncSession, email: str, password: str) -> User:
    """Verify credentials and return the User.

    Args:
        session: Active async DB session.
        email: User's email address.
        password: Plain-text password attempt.

    Returns:
        Authenticated User ORM instance.

    Raises:
        AuthenticationError: On invalid credentials.
    """
    user = await session.scalar(select(User).where(User.email == email))
    if not user or not verify_password(password, user.hashed_password):
        raise AuthenticationError("Invalid email or password")
    log.info("user.login", user_id=str(user.id))
    return user
