// website/nextjs/lib/liveVideo.ts
// WebRTC signaling helpers for the live video feed. Signaling rides the existing
// live-ops WebSocket (send via the LiveOpsHandle from liveOps.ts). ICE servers are
// fetched from the relay's /turn-credentials endpoint.

export type SignalKind = "offer" | "answer" | "ice" | "bye";

export interface SignalMsg {
  kind: SignalKind;
  operator_id: string;
  sdp?: string;
  candidate?: { candidate: string; sdpMLineIndex: number };
}

export function buildSignalEnvelope(
  kind: SignalKind,
  operatorId: string,
  body: { sdp?: string; candidate?: SignalMsg["candidate"] } = {}
) {
  return { type: "signal", signal: { kind, operator_id: operatorId, ...body } };
}

export function parseSignalFrame(raw: string): SignalMsg | null {
  try {
    const env = JSON.parse(raw);
    return env?.type === "signal" && env.signal ? (env.signal as SignalMsg) : null;
  } catch {
    return null;
  }
}

const PUBLIC_STUN: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export async function fetchIceServers(
  relayHttpUrl: string,
  opsToken: string,
  name: string
): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(
      `${relayHttpUrl}/turn-credentials?token=${encodeURIComponent(opsToken)}&name=${encodeURIComponent(name)}`
    );
    if (!res.ok) return PUBLIC_STUN;
    const data = await res.json();
    return (data.iceServers as RTCIceServer[]) ?? PUBLIC_STUN;
  } catch {
    return PUBLIC_STUN;
  }
}
