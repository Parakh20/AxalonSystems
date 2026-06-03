// website/nextjs/components/Platform/LiveOpsTab.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  connectLiveOps, buildCommandEnvelope, buildControlEnvelope,
  type Telemetry, type Ack, type ControlReply, type CommandType, type LiveOpsHandle,
} from "@/lib/liveOps";

const RELAY_WS = process.env.NEXT_PUBLIC_RELAY_WS_URL ?? "";
const OPS_TOKEN = process.env.NEXT_PUBLIC_OPS_TOKEN ?? "";

const DESTRUCTIVE: CommandType[] = ["ARM", "TAKEOFF", "LAND"];

export default function LiveOpsTab({ droneId = "sitl-01" }: { droneId?: string }) {
  const operatorId = useMemo(
    () => "op-" + Math.random().toString(36).slice(2, 8), []);
  const [telem, setTelem] = useState<Telemetry | null>(null);
  const [status, setStatus] = useState("idle");
  const [hasControl, setHasControl] = useState(false);
  const [lastAck, setLastAck] = useState<Ack | null>(null);
  const handleRef = useRef<LiveOpsHandle | null>(null);

  useEffect(() => {
    if (!RELAY_WS) { setStatus("no relay configured"); return; }
    const h = connectLiveOps(RELAY_WS, droneId, OPS_TOKEN, operatorId, {
      onTelemetry: setTelem,
      onStatus: setStatus,
      onAck: setLastAck,
      onControl: (c: ControlReply) =>
        setHasControl(c.granted === true && c.holder === operatorId),
    });
    handleRef.current = h;
    return () => h.dispose();
  }, [droneId, operatorId]);

  const send = (env: object) => handleRef.current?.send(env);

  const acquire = () => send(buildControlEnvelope("acquire", operatorId));
  const release = () => { send(buildControlEnvelope("release", operatorId)); setHasControl(false); };

  const sendCmd = (type: CommandType, params: Record<string, unknown> = {}) => {
    if (DESTRUCTIVE.includes(type) &&
        !window.confirm(`Confirm ${type}${params.alt ? ` to ${params.alt} m` : ""}?`)) return;
    send(buildCommandEnvelope(type, params));
  };

  const tier = telem?.link_tier ?? "RED";
  const cmdsEnabled = hasControl && tier !== "RED";

  return (
    <div className="liveops">
      <div className="liveops-hud">
        <span>Link: {status}</span>
        <span>Tier: {tier}</span>
        {telem && <>
          <span>Mode: {telem.mode}</span>
          <span>{telem.armed ? "ARMED" : "DISARMED"}</span>
          <span>Alt: {telem.alt_rel_m.toFixed(1)} m</span>
          <span>Bat: {telem.battery_pct.toFixed(0)}%</span>
        </>}
      </div>

      <div className="liveops-control">
        {hasControl
          ? <button onClick={release}>Release control</button>
          : <button onClick={acquire}>Acquire control</button>}
        <span>{hasControl ? "You have control" : "View-only"}</span>
      </div>

      <div className="liveops-commands">
        <button disabled={!cmdsEnabled} onClick={() => sendCmd("ARM")}>Arm</button>
        <button disabled={!cmdsEnabled} onClick={() => sendCmd("TAKEOFF", { alt: 40 })}>Takeoff 40m</button>
        <button disabled={!cmdsEnabled} onClick={() => sendCmd("PAUSE")}>Pause</button>
        <button disabled={!cmdsEnabled} onClick={() => sendCmd("RESUME")}>Resume</button>
        <button disabled={!cmdsEnabled} onClick={() => sendCmd("RTL")}>RTL</button>
        <button disabled={!cmdsEnabled} onClick={() => sendCmd("LAND")}>Land</button>
      </div>

      {lastAck && (
        <p className={lastAck.success ? "ack-ok" : "ack-fail"}>
          {lastAck.success ? "✓" : "✗"} {lastAck.cmd_id.slice(0, 6)}: {lastAck.message}
        </p>
      )}

      {/* Map marker + breadcrumb: same as Phase 1 (reuse PlanMap.tsx Leaflet pattern). */}
      {telem && (
        <p className="liveops-pos">
          {telem.lat.toFixed(5)}, {telem.lon.toFixed(5)} @ {telem.heading_deg.toFixed(0)}°
        </p>
      )}
    </div>
  );
}
