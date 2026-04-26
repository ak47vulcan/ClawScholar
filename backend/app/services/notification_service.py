"""WebSocket notification service: broadcasts agent events to connected clients."""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime

import structlog
from fastapi import WebSocket

log = structlog.get_logger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections per run_id and user_id.

    Clients subscribe to a specific run_id to receive agent events for that run.
    The special key ``"*"`` is used for global / all-run broadcasts.
    """

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, run_id: str = "*") -> None:
        """Accept and register a WebSocket under *run_id*.

        Args:
            websocket: Incoming WebSocket connection.
            run_id: Run identifier to subscribe to, or ``"*"`` for global.
        """
        await websocket.accept()
        self._connections[run_id].append(websocket)
        log.info("ws.connected", run_id=run_id, total=len(self._connections[run_id]))

    def disconnect(self, websocket: WebSocket, run_id: str = "*") -> None:
        """Remove *websocket* from the *run_id* pool.

        Args:
            websocket: WebSocket to deregister.
            run_id: Run identifier it was registered under.
        """
        sockets = self._connections.get(run_id, [])
        if websocket in sockets:
            sockets.remove(websocket)
        log.info("ws.disconnected", run_id=run_id)

    async def broadcast(self, event: dict, run_id: str = "*") -> None:
        """Send *event* to all subscribers of *run_id*.

        Dead connections are removed silently.

        Args:
            event: JSON-serialisable event payload.
            run_id: Target audience; ``"*"`` broadcasts to all connections.
        """
        payload = json.dumps({**event, "timestamp": datetime.now(UTC).isoformat()})
        targets = list(self._connections.get(run_id, []))
        if run_id != "*":
            targets += list(self._connections.get("*", []))

        dead: list[WebSocket] = []
        for ws in set(targets):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            for pool in self._connections.values():
                if ws in pool:
                    pool.remove(ws)


manager = ConnectionManager()


async def emit_agent_log(
    *,
    run_id: str,
    agent_type: str,
    action: str,
    message: str,
    payload: dict | None = None,
) -> None:
    """Convenience wrapper: broadcast an AGENT_LOG event.

    Args:
        run_id: Workflow run identifier.
        agent_type: One of SCHEDULER | ANALYST | LIBRARIAN | ORCHESTRATOR.
        action: Short action name (e.g. ANALYZE, VALIDATE, COMPLETE).
        message: Human-readable description.
        payload: Optional additional data to include.
    """
    await manager.broadcast(
        {
            "type": "AGENT_LOG",
            "run_id": run_id,
            "agentType": agent_type,
            "action": action,
            "message": message,
            "payload": payload or {},
        },
        run_id=run_id,
    )


async def emit_workflow_progress(*, run_id: str, status: str, progress: int) -> None:
    """Broadcast a WORKFLOW_PROGRESS event.

    Args:
        run_id: Workflow run identifier.
        status: Current workflow status string.
        progress: Integer percentage 0–100.
    """
    await manager.broadcast(
        {"type": "WORKFLOW_PROGRESS", "run_id": run_id, "status": status, "progress": progress},
        run_id=run_id,
    )
