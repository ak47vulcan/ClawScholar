import json
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.logging import get_logger
from app.core.security import decode_token

logger = get_logger(__name__)
ws_router = APIRouter()

# Registry of active WebSocket connections keyed by user_id
_connections: dict[str, list[WebSocket]] = {}


async def broadcast_to_user(user_id: str, event: dict) -> None:
    """Broadcast an event to all WebSocket connections of a user."""
    connections = _connections.get(user_id, [])
    dead = []
    for ws in connections:
        try:
            await ws.send_text(json.dumps(event, default=str))
        except Exception:
            dead.append(ws)
    for ws in dead:
        connections.remove(ws)


async def broadcast_all(event: dict) -> None:
    """Broadcast to all connected users (admin/debug use)."""
    for user_id in list(_connections.keys()):
        await broadcast_to_user(user_id, event)


@ws_router.websocket("/agent-stream")
async def agent_stream(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token", "")
    try:
        user_id = decode_token(token)
    except ValueError:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    _connections.setdefault(user_id, []).append(websocket)
    logger.info("WebSocket connected", user_id=user_id)

    try:
        # Send initial ping
        await websocket.send_text(json.dumps({"type": "PING", "timestamp": datetime.now(UTC).isoformat()}))

        while True:
            # Keep-alive: wait for client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "PONG", "timestamp": datetime.now(UTC).isoformat()}))
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected", user_id=user_id)
    finally:
        if user_id in _connections:
            try:
                _connections[user_id].remove(websocket)
            except ValueError:
                pass
