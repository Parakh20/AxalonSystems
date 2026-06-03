// website/nextjs/lib/missionToWaypoints.ts
// Adapts mission-planner waypoints into the UPLOAD_MISSION command payload the
// drone agent expects ({seq, lat, lon, alt_m}). Keeps the live-ops surface
// decoupled from the planner's internal Waypoint shape.

export interface PlannedPoint {
  lat: number;
  lon: number;
  altitude?: number;
}

export interface AgentWaypoint {
  seq: number;
  lat: number;
  lon: number;
  alt_m: number;
}

export function missionToWaypoints(
  points: PlannedPoint[],
  defaultAltM = 40
): AgentWaypoint[] {
  return points.map((p, i) => ({
    seq: i,
    lat: p.lat,
    lon: p.lon,
    alt_m: p.altitude ?? defaultAltM,
  }));
}
