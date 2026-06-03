# drone/agent/main.py
"""Agent entrypoint: pump MAVLink telemetry to the relay.

Glue only — every unit it uses is tested elsewhere. Run on the Jetson (or any
box that can reach SITL) as a systemd service. See docs/DEPLOY_DRONE_OPS.md.
"""
from __future__ import annotations

import asyncio
import time

import websockets
from pymavlink import mavutil

from drone.agent.config import AgentConfig
from drone.agent.mavlink_source import TelemetryAccumulator
from drone.agent.ws_client import RelayClient
from drone.common.telemetry import Envelope


async def run(cfg: AgentConfig) -> None:
    mav = mavutil.mavlink_connection(cfg.mavlink_url)
    mav.wait_heartbeat()
    acc = TelemetryAccumulator(cfg.drone_id)

    async def connector():
        return await websockets.connect(cfg.ops_url())

    client = RelayClient(connector)
    await client.connect()

    seq = 0
    loop = asyncio.get_event_loop()
    while True:
        # drain all pending mavlink messages without blocking the event loop
        while True:
            m = await loop.run_in_executor(None, lambda: mav.recv_match(blocking=False))
            if m is None:
                break
            acc.update(m)

        telem = acc.build(ts=time.time(), seq=seq)
        if telem is not None:
            env = Envelope(type="telemetry", telemetry=telem)
            await client.send(env.model_dump_json())
            seq += 1
        await asyncio.sleep(cfg.period_s)


def main() -> None:
    asyncio.run(run(AgentConfig.from_env()))


if __name__ == "__main__":
    main()
