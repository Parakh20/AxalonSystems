// website/nextjs/components/Platform/LiveOpsTab.tsx
"use client";

import { useEffect, useState } from "react";
import { connectLiveOps, type Telemetry } from "@/lib/liveOps";

const RELAY_WS = process.env.NEXT_PUBLIC_RELAY_WS_URL ?? "";
const OPS_TOKEN = process.env.NEXT_PUBLIC_OPS_TOKEN ?? "";

function Hud({ t, status }: { t: Telemetry | null; status: string }) {
  return (
    <div className="liveops-hud">
      <span>Link: {status}</span>
      {t && (
        <>
          <span>Mode: {t.mode}</span>
          <span>{t.armed ? "ARMED" : "DISARMED"}</span>
          <span>Alt: {t.alt_rel_m.toFixed(1)} m</span>
          <span>Spd: {t.groundspeed_ms.toFixed(1)} m/s</span>
          <span>Bat: {t.battery_pct.toFixed(0)}%</span>
          <span>Sats: {t.satellites}</span>
          <span>Tier: {t.link_tier}</span>
        </>
      )}
    </div>
  );
}

export default function LiveOpsTab({ droneId = "sitl-01" }: { droneId?: string }) {
  const [telem, setTelem] = useState<Telemetry | null>(null);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    if (!RELAY_WS) {
      setStatus("no relay configured");
      return;
    }
    const dispose = connectLiveOps(RELAY_WS, droneId, OPS_TOKEN, {
      onTelemetry: (t) => setTelem(t),
      onStatus: (s) => setStatus(s),
    });
    return dispose;
  }, [droneId]);

  return (
    <div className="liveops">
      <Hud t={telem} status={status} />
      {/* Map: reuse the mission-planner Leaflet wrapper. Render a marker at
          [telem.lat, telem.lon] rotated to telem.heading_deg, plus a breadcrumb
          polyline of recent positions. Follow PlanMap.tsx's dynamic-import shape. */}
      {telem && (
        <p className="liveops-pos">
          {telem.lat.toFixed(5)}, {telem.lon.toFixed(5)} @ {telem.heading_deg.toFixed(0)}°
        </p>
      )}
    </div>
  );
}
