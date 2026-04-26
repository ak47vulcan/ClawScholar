from datetime import UTC, datetime, timedelta
import hashlib

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

# NOTE:
# We intentionally avoid bcrypt here. The bcrypt backend can fail at runtime in
# some container environments (and bcrypt has a 72-byte password limit).
# `pbkdf2_sha256` is widely supported and stable for local demos/hackathon use.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + (expires_delta or timedelta(minutes=settings.jwt_expiry_minutes))
    payload = {"sub": subject, "exp": expire, "iat": datetime.now(UTC)}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        subject: str = payload.get("sub", "")
        if not subject:
            raise ValueError("Missing subject in token")
        return subject
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc


def create_refresh_token(subject: str) -> str:
    return create_access_token(subject, expires_delta=timedelta(days=30))
