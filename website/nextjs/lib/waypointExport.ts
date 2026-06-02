// website/nextjs/lib/waypointExport.ts
import type { Waypoint, MissionParams } from './missionGeometry'

export type ExportFormat = 'litchi' | 'kml' | 'plan'

// ── MAVLink command IDs (QGroundControl .plan) ───────────────────────────────
const CMD_WAYPOINT = 16
const CMD_TAKEOFF = 22
const CMD_RTL = 20
const CMD_SET_CAM_TRIGG_DIST = 206

const NADIR_PITCH = -90

export function fileSlug(missionName: string): string {
  const slug = missionName.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || 'mission'
}

// ── Litchi CSV ───────────────────────────────────────────────────────────────
// Litchi Mission Hub format. Photos are captured by distance interval
// (photo_distinterval) rather than per-waypoint actions, so action slots are -1.
const LITCHI_ACTION_SLOTS = 15

function litchiHeader(): string {
  const cols = [
    'latitude', 'longitude', 'altitude(m)', 'heading(deg)', 'curvesize(m)',
    'rotationdir', 'gimbalmode', 'gimbalpitchangle',
  ]
  for (let i = 1; i <= LITCHI_ACTION_SLOTS; i++) cols.push(`actiontype${i}`, `actionparam${i}`)
  cols.push(
    'altitudemode', 'speed(m/s)', 'poi_latitude', 'poi_longitude',
    'poi_altitude(m)', 'poi_altitudemode', 'photo_timeinterval', 'photo_distinterval',
  )
  return cols.join(',')
}

export function toLitchiCsv(waypoints: Waypoint[], params: MissionParams, triggerDistM: number): string {
  const lines = [litchiHeader()]
  for (const wp of waypoints) {
    // gimbalmode 2 = interpolate, altitudemode 0 = above ground
    const cells: (number | string)[] = [wp.lat, wp.lon, wp.alt, 0, 0, 0, 2, NADIR_PITCH]
    for (let i = 0; i < LITCHI_ACTION_SLOTS; i++) cells.push(-1, 0) // no per-waypoint action
    cells.push(0, params.speedMs, 0, 0, 0, 0, -1, triggerDistM)
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}

// ── KML ──────────────────────────────────────────────────────────────────────
function escapeXml(s: string): string {
  const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }
  return s.replace(/[<>&'"]/g, (c) => map[c])
}

export function toKml(waypoints: Waypoint[], missionName: string): string {
  const coords = waypoints.map((w) => `${w.lon},${w.lat},${w.alt}`).join(' ')
  const placemarks = waypoints
    .map((w, i) =>
      `      <Placemark><name>WP${i + 1}</name><Point>` +
      `<altitudeMode>relativeToGround</altitudeMode>` +
      `<coordinates>${w.lon},${w.lat},${w.alt}</coordinates></Point></Placemark>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(missionName)}</name>
    <Placemark>
      <name>Flight path</name>
      <LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${coords}</coordinates></LineString>
    </Placemark>
${placemarks}
  </Document>
</kml>`
}

// ── QGroundControl .plan ─────────────────────────────────────────────────────
function emptyMission() {
  return {
    cruiseSpeed: 10, firmwareType: 12, globalPlanAltitudeMode: 1, hoverSpeed: 5,
    items: [] as object[], plannedHomePosition: [0, 0, 0], vehicleType: 2, version: 2,
  }
}

export function toQgcPlan(waypoints: Waypoint[], triggerDistM: number): string {
  const base = {
    fileType: 'Plan', version: 1, groundStation: 'Axalon',
    geoFence: { circles: [], polygons: [], version: 2 },
    rallyPoints: { points: [], version: 2 },
  }
  if (waypoints.length === 0) {
    return JSON.stringify({ ...base, mission: emptyMission() }, null, 2)
  }
  const home = waypoints[0]
  const items: object[] = []
  let seq = 0
  const navItem = (command: number, lat: number, lon: number, alt: number) => ({
    AMSLAltAboveTerrain: null, Altitude: alt, AltitudeMode: 1, autoContinue: true,
    command, doJumpId: ++seq, frame: 3, params: [0, 0, 0, null, lat, lon, alt], type: 'SimpleItem',
  })
  items.push(navItem(CMD_TAKEOFF, home.lat, home.lon, home.alt))
  items.push({
    autoContinue: true, command: CMD_SET_CAM_TRIGG_DIST, doJumpId: ++seq, frame: 2,
    params: [triggerDistM, 0, 0, 0, 0, 0, 0], type: 'SimpleItem',
  })
  for (let i = 1; i < waypoints.length; i++) {
    const wp = waypoints[i]
    items.push(navItem(CMD_WAYPOINT, wp.lat, wp.lon, wp.alt))
  }
  items.push({
    autoContinue: true, command: CMD_RTL, doJumpId: ++seq, frame: 2,
    params: [0, 0, 0, 0, 0, 0, 0], type: 'SimpleItem',
  })
  const mission = {
    cruiseSpeed: 10, firmwareType: 12, globalPlanAltitudeMode: 1, hoverSpeed: 5,
    items, plannedHomePosition: [home.lat, home.lon, home.alt], vehicleType: 2, version: 2,
  }
  return JSON.stringify({ ...base, mission }, null, 2)
}

// ── Unified serialise + download ─────────────────────────────────────────────
type Serialised = { text: string; ext: string; mime: string }

export function serialiseMission(
  waypoints: Waypoint[], params: MissionParams, missionName: string,
  triggerDistM: number, format: ExportFormat,
): Serialised {
  if (format === 'litchi') return { text: toLitchiCsv(waypoints, params, triggerDistM), ext: 'csv', mime: 'text/csv' }
  if (format === 'kml') return { text: toKml(waypoints, missionName), ext: 'kml', mime: 'application/vnd.google-earth.kml+xml' }
  return { text: toQgcPlan(waypoints, triggerDistM), ext: 'plan', mime: 'application/json' }
}

export function downloadMission(
  waypoints: Waypoint[], params: MissionParams, missionName: string,
  triggerDistM: number, format: ExportFormat,
): void {
  const { text, ext, mime } = serialiseMission(waypoints, params, missionName, triggerDistM, format)
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${fileSlug(missionName)}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
