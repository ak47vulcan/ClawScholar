from pydantic import BaseModel, Field


class AnalystOutput(BaseModel):
    code: str | None = None
    stdout: str | None = None
    stderr: str | None = None
    plots: list[str] = Field(default_factory=list)  # Base64 encoded
    findings: str
    methodology: str
    limitations: str | None = None
    execution_attempts: int = 0
    error: str | None = None
