// website/nextjs/lib/liveOps.ts
// Browser-side live-ops client: parses telemetry frames and manages the ops
// WebSocket subscription to the relay. Mirrors drone/common/telemetry.py.

export type LinkTier = "GREEN" | "AMBER" | "RED";

export interface Telemetry {
  drone_id: string;
  ts: number;
  seq: number;
  lat: number;
  lon: number;
  alt_rel_m: number;
  alt_amsl_m: number;
  heading_deg: number;
  groundspeed_ms: number;
  battery_pct: number;
  battery_voltage: number;
  mode: string;
  armed: boolean;
  gps_fix: number;
  satellites: number;
  roll_deg: number;
  pitch_deg: number;
  yaw_deg: number;
  link_tier: LinkTier;
}

export function parseTelemetryFrame(raw: string): Telemetry | null {
  try {
    const env = JSON.parse(raw);
    if (env?.type !== "telemetry" || !env.telemetry) return null;
    return env.telemetry as Telemetry;
  } catch {
    return null;
  }
}

export interface LiveOpsHandlers {
  onTelemetry: (t: Telemetry) => void;
  onStatus?: (s: "connecting" | "open" | "closed") => void;
}

/** Opens the ops WebSocket and pumps telemetry to the handler. Returns a
 *  disposer. Auto-reconnects with backoff. */
export function connectLiveOps(
  baseWsUrl: string,
  droneId: string,
  opsToken: string,
  handlers: LiveOpsHandlers
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = 1000;

  const open = () => {
    if (closed) return;
    handlers.onStatus?.("connecting");
    const url = `${baseWsUrl}/ws/ops/${droneId}?token=${encodeURIComponent(opsToken)}`;
    ws = new WebSocket(url);
    ws.onopen = () => {
      backoff = 1000;
      handlers.onStatus?.("open");
    };
    ws.onmessage = (ev) => {
      const t = parseTelemetryFrame(ev.data as string);
      if (t) handlers.onTelemetry(t);
    };
    ws.onclose = () => {
      handlers.onStatus?.("closed");
      if (!closed) setTimeout(open, (backoff = Math.min(backoff * 2, 15000)));
    };
    ws.onerror = () => ws?.close();
  };

  open();
  return () => {
    closed = true;
    ws?.close();
  };
}
