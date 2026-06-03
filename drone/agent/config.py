# drone/agent/config.py
"""Agent configuration from environment. No secrets in code."""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentConfig:
    drone_id: str
    drone_token: str
    relay_ws_url: str   # base, e.g. wss://relay.example.com
    mavlink_url: str    # e.g. udpin:127.0.0.1:14550 (SITL)
    telemetry_hz: float

    @classmethod
    def from_env(cls) -> "AgentConfig":
        return cls(
            drone_id=os.environ["DRONE_ID"],
            drone_token=os.environ["DRONE_TOKEN"],
            relay_ws_url=os.environ["RELAY_WS_URL"].rstrip("/"),
            mavlink_url=os.environ["MAVLINK_URL"],
            telemetry_hz=float(os.getenv("TELEMETRY_HZ", "5")),
        )

    @property
    def period_s(self) -> float:
        return 1.0 / self.telemetry_hz

    def ops_url(self) -> str:
        return f"{self.relay_ws_url}/ws/drone/{self.drone_id}?token={self.drone_token}"
