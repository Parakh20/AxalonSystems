# drone/agent/main.py
"""Agent entrypoint (Phase 2): telemetry out + commands in + heartbeat/deadman.

Three concurrent loops over one WebSocket:
- telemetry_loop: drain MAVLink, build Telemetry (stamped with current link tier), send.
- recv_loop: handle inbound commands (-> executor -> ack) and heartbeat echoes (-> RTT).
- heartbeat_loop: send heartbeats for RTT; trip the deadman -> RTL if the relay goes silent.

Glue only — executor, safety, commander, and the schema are unit-tested.
"""
from __future__ import annotations

import asyncio
import time

import websockets
from pymavlink import mavutil

from drone.agent.command_executor import CommandExecutor
from drone.agent.commander import PymavlinkCommander
from drone.agent.config import AgentConfig
from drone.agent.mavlink_source import TelemetryAccumulator
from drone.agent.safety import Deadman, tier_from_rtt
from drone.common.telemetry import Envelope


class AgentState:
    def __init__(self) -> None:
        self.tier_rtt_s: float | None = None
        self.seq = 0


async def run(cfg: AgentConfig) -> None:
    mav = mavutil.mavlink_connection(cfg.mavlink_url)
    mav.wait_heartbeat()
    acc = TelemetryAccumulator(cfg.drone_id)
    commander = PymavlinkCommander(mav)
    executor = CommandExecutor(commander, cfg.min_alt_m, cfg.max_alt_m)
    deadman = Deadman(cfg.deadman_timeout_s)
    state = AgentState()
    loop = asyncio.get_event_loop()

    async with websockets.connect(cfg.ops_url()) as ws:
        deadman.beat(time.time())

        async def telemetry_loop():
            while True:
                while True:
                    m = await loop.run_in_executor(None, lambda: mav.recv_match(blocking=False))
                    if m is None:
                        break
                    acc.update(m)
                telem = acc.build(ts=time.time(), seq=state.seq)
                if telem is not None:
                    telem = telem.model_copy(update={"link_tier": tier_from_rtt(state.tier_rtt_s)})
                    await ws.send(Envelope(type="telemetry", telemetry=telem).model_dump_json())
                    state.seq += 1
                await asyncio.sleep(cfg.period_s)

        async def recv_loop():
            async for raw in ws:
                deadman.beat(time.time())
                env = Envelope.model_validate_json(raw)
                if env.type == "command" and env.command is not None:
                    ack = executor.execute(env.command)
                    await ws.send(Envelope(type="ack", ack=ack).model_dump_json())
                elif env.type == "heartbeat" and env.ts is not None:
                    state.tier_rtt_s = time.time() - env.ts

        async def heartbeat_loop():
            period = 1.0 / cfg.heartbeat_hz
            while True:
                await ws.send(Envelope(type="heartbeat", ts=time.time()).model_dump_json())
                if deadman.expired(time.time()):
                    commander.rtl()  # link presumed lost -> fail safe
                await asyncio.sleep(period)

        await asyncio.gather(telemetry_loop(), recv_loop(), heartbeat_loop())


def main() -> None:
    asyncio.run(run(AgentConfig.from_env()))


if __name__ == "__main__":
    main()
