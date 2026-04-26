"""Communication with the isolated sandbox container via Redis queues."""

import asyncio
import json
import uuid

from app.config import get_settings
from app.core.logging import get_logger
from app.core.redis import get_redis

logger = get_logger(__name__)


async def execute_in_sandbox(code: str) -> dict:
    """Send code to sandbox, wait for result. Returns {stdout, stderr, plots, exit_code}."""
    settings = get_settings()
    task_id = str(uuid.uuid4())

    payload = json.dumps({"task_id": task_id, "code": code, "timeout_seconds": settings.sandbox_timeout_seconds})

    redis = await get_redis()
    result_key = f"{settings.sandbox_queue_result_prefix}:{task_id}"

    await redis.rpush(settings.sandbox_queue_execute, payload)
    logger.info("Sent code to sandbox", task_id=task_id)

    # Poll for result with timeout
    timeout = settings.sandbox_timeout_seconds + 5
    result_raw = await redis.blpop([result_key], timeout=timeout)

    if not result_raw:
        return {"stdout": "", "stderr": "Sandbox execution timed out", "plots": [], "exit_code": -1}

    _, result_json = result_raw
    result = json.loads(result_json)
    logger.info("Sandbox result received", task_id=task_id, exit_code=result.get("exit_code"))
    return result
