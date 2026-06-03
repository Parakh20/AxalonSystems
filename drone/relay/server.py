# drone/relay/server.py
"""Relay FastAPI app.

Two WebSocket endpoints share one RelayManager:
- /ws/drone/{drone_id}?token=... : the Jetson agent pushes telemetry frames here.
- /ws/ops/{drone_id}?token=...   : browsers subscribe; receive fanned-out frames.

Phase 1 only relays drone->ops telemetry. Command routing (ops->drone) is added
in Phase 2 but the manager + envelope already accommodate it.
"""
from __future__ import annotations

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status

from drone.relay.auth import AuthError, verify_drone_token, verify_operator_token
from drone.relay.manager import RelayManager


def create_app() -> FastAPI:
    app = FastAPI(title="Axalon Drone Relay")
    mgr = RelayManager()
    app.state.manager = mgr

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.websocket("/ws/drone/{drone_id}")
    async def drone_ws(ws: WebSocket, drone_id: str, token: str = ""):
        try:
            verify_drone_token(drone_id, token)
        except AuthError:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        await ws.accept()
        mgr.register_drone(drone_id, ws)
        try:
            while True:
                raw = await ws.receive_text()
                await mgr.broadcast_telemetry(drone_id, raw)
        except WebSocketDisconnect:
            pass
        finally:
            mgr.unregister_drone(drone_id)

    @app.websocket("/ws/ops/{drone_id}")
    async def ops_ws(ws: WebSocket, drone_id: str, token: str = ""):
        try:
            verify_operator_token(token)
        except AuthError:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        await ws.accept()
        mgr.add_operator(drone_id, ws)
        try:
            while True:
                await ws.receive_text()  # Phase 1: ignore inbound from ops
        except WebSocketDisconnect:
            pass
        finally:
            mgr.remove_operator(drone_id, ws)

    return app


app = create_app()
