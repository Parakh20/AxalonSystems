// website/nextjs/tests/unit/missionToWaypoints.test.ts
import { describe, it, expect } from "vitest";
import { missionToWaypoints } from "@/lib/missionToWaypoints";

describe("missionToWaypoints", () => {
  it("maps planner waypoints to the agent upload format", () => {
    const planned = [
      { lat: 28.4, lon: 77.1, altitude: 40 },
      { lat: 28.41, lon: 77.1, altitude: 40 },
    ];
    const wps = missionToWaypoints(planned);
    expect(wps).toEqual([
      { seq: 0, lat: 28.4, lon: 77.1, alt_m: 40 },
      { seq: 1, lat: 28.41, lon: 77.1, alt_m: 40 },
    ]);
  });

  it("falls back to a default altitude when missing", () => {
    const wps = missionToWaypoints([{ lat: 1, lon: 2 }], 30);
    expect(wps[0].alt_m).toBe(30);
  });

  it("returns empty array for empty input", () => {
    expect(missionToWaypoints([])).toEqual([]);
  });
});
