// website/nextjs/lib/waypointExport.ts
import type { Waypoint } from './missionGeometry'

// MAVLink command IDs
const CMD_WAYPOINT = 16
const CMD_TAKEOFF = 22
const CMD_RTL = 20
const CMD_SET_CAM_TRIGG_DIST = 206

function row(
  index: number,
  current: number,
  frame: number,
  command: number,
  p1: number,
  p2: number,
  p3: number,
  p4: number,
  lat: number,
  lon: number,
  alt: number,
  autocontinue = 1,
): string {
  return [index, current, frame, command, p1, p2, p3, p4, lat, lon, alt, autocontinue].join('\t')
}

/**
 * Serialise waypoints to QGC WPL 110 (ArduPilot / Mission Planner / QGroundControl).
 * triggerDistM is the camera trigger distance in metres (0 disables triggering).
 * waypoints[0] is treated as the home/takeoff position.
 */
export function serialiseQGCWPL110(waypoints: Waypoint[], triggerDistM: number): string {
  const lines = ['QGC WPL 110']
  if (waypoints.length === 0) return lines.join('\n')

  const home = waypoints[0]
  let idx = 0
  // Home (frame 0 = global abs alt)
  lines.push(row(idx++, 1, 0, CMD_WAYPOINT, 0, 0, 0, 0, home.lat, home.lon, home.alt))
  // Takeoff (frame 3 = relative alt)
  lines.push(row(idx++, 0, 3, CMD_TAKEOFF, 0, 0, 0, 0, home.lat, home.lon, home.alt))
  // Camera trigger distance
  lines.push(row(idx++, 0, 3, CMD_SET_CAM_TRIGG_DIST, triggerDistM, 0, 0, 0, 0, 0, 0))
  // Survey waypoints (skip index 0 which is home/takeoff position)
  for (let i = 1; i < waypoints.length; i++) {
    const wp = waypoints[i]
    lines.push(row(idx++, 0, 3, CMD_WAYPOINT, 0, 0, 0, 0, wp.lat, wp.lon, wp.alt))
  }
  // RTL
  lines.push(row(idx++, 0, 3, CMD_RTL, 0, 0, 0, 0, 0, 0, 0))
  return lines.join('\n')
}

export function waypointFilename(missionName: string): string {
  const slug = missionName.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug ? `${slug}.waypoints` : 'mission.waypoints'
}

export function downloadWaypoints(waypoints: Waypoint[], triggerDistM: number, missionName: string): void {
  const text = serialiseQGCWPL110(waypoints, triggerDistM)
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = waypointFilename(missionName)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
