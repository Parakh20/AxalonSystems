# drone/relay/manager.py
"""In-memory registry of connected drones and operators, with telemetry fan-out.

A "sink" is any object with `async def send_text(str)`. FastAPI's WebSocket
satisfies this, and tests use a fake. Keeping the manager transport-agnostic is
what makes the routing logic unit-testable without sockets.
"""
from __future__ import annotations

from typing import Protocol


class Sink(Protocol):
    async def send_text(self, data: str) -> None: ...


class RelayManager:
    def __init__(self) -> None:
        self._operators: dict[str, set[Sink]] = {}
        self._drones: dict[str, Sink] = {}

    # --- operators ---
    def add_operator(self, drone_id: str, sink: Sink) -> None:
        self._operators.setdefault(drone_id, set()).add(sink)

    def remove_operator(self, drone_id: str, sink: Sink) -> None:
        self._operators.get(drone_id, set()).discard(sink)

    def operators_for(self, drone_id: str) -> set[Sink]:
        return self._operators.get(drone_id, set())

    # --- drones ---
    def register_drone(self, drone_id: str, sink: Sink) -> None:
        self._drones[drone_id] = sink

    def unregister_drone(self, drone_id: str) -> None:
        self._drones.pop(drone_id, None)

    def is_online(self, drone_id: str) -> bool:
        return drone_id in self._drones

    # --- fan-out ---
    async def broadcast_telemetry(self, drone_id: str, raw: str) -> None:
        dead: list[Sink] = []
        for sink in list(self.operators_for(drone_id)):
            try:
                await sink.send_text(raw)
            except Exception:
                dead.append(sink)
        for sink in dead:
            self.remove_operator(drone_id, sink)
