from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class ClawScholarError(Exception):
    def __init__(self, message: str, status_code: int = 500) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(ClawScholarError):
    def __init__(self, resource: str, id: str) -> None:
        super().__init__(f"{resource} '{id}' not found", status_code=404)


class UnauthorizedError(ClawScholarError):
    def __init__(self, message: str = "Unauthorized") -> None:
        super().__init__(message, status_code=401)


class ValidationError(ClawScholarError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=422)


async def clawscholar_exception_handler(request: Request, exc: ClawScholarError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "type": type(exc).__name__},
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )
