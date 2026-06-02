// website/nextjs/components/Platform/PlanMap.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import type { LatLon, Waypoint, MissionStats, MissionType } from '@/lib/missionGeometry'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

const SAT_URL = MAPBOX_TOKEN
  ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
  : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const SAT_ATTR = MAPBOX_TOKEN ? '© Mapbox © OpenStreetMap' : 'Tiles © Esri'

// Esri World Imagery only has tiles up to ~z19; beyond that it returns a
// "Map data not yet available" tile. Cap native zoom there and upscale. Mapbox goes higher.
const SAT_MAX_NATIVE_ZOOM = MAPBOX_TOKEN ? 22 : 19

// Battery-leg colors (cycled).
const LEG_COLORS = ['#06b6d4', '#f59e0b', '#a855f7', '#10b981', '#ef4444', '#3b82f6']
const MAX_ARROWS = 24

type Props = {
  missionType: MissionType
  polygon: LatLon[] | null
  waypoints: Waypoint[]
  stats: MissionStats | null
  orbitRadiusM?: number
  onShapeDrawn: (points: LatLon[]) => void
  onClear: () => void
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m ${s}s`
}

export default function PlanMap({
  missionType,
  polygon,
  waypoints,
  stats,
  orbitRadiusM,
  onShapeDrawn,
  onClear,
}: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const drawnRef = useRef<L.FeatureGroup | null>(null)
  const pathRef = useRef<L.LayerGroup | null>(null)
  const onShapeDrawnRef = useRef(onShapeDrawn)
  const onClearRef = useRef(onClear)
  onShapeDrawnRef.current = onShapeDrawn
  onClearRef.current = onClear

  const [north, setNorth] = useState('')
  const [east, setEast] = useState('')
  const [coordError, setCoordError] = useState('')

  function recenter() {
    const map = mapRef.current
    const lat = parseFloat(north)
    const lon = parseFloat(east)
    if (!map) return
    if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setCoordError('Enter valid N/E')
      return
    }
    setCoordError('')
    map.setView([lat, lon], Math.max(map.getZoom(), 17))
  }

  // Initialise map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    const map = L.map(mapDivRef.current, { center: [18.5204, 73.8567], zoom: 16 })
    L.tileLayer(SAT_URL, { attribution: SAT_ATTR, maxZoom: 22, maxNativeZoom: SAT_MAX_NATIVE_ZOOM }).addTo(map)

    const drawn = new L.FeatureGroup()
    map.addLayer(drawn)
    drawnRef.current = drawn
    pathRef.current = L.layerGroup().addTo(map)

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawn.clearLayers()
      const layer = e.layer
      drawn.addLayer(layer)
      if (typeof layer.getLatLngs === 'function') {
        const raw = layer.getLatLngs()
        const latlngs = (Array.isArray(raw?.[0]) ? raw[0] : raw ?? []) as L.LatLng[]
        const pts: LatLon[] = (Array.isArray(latlngs) ? latlngs : []).map((ll: L.LatLng) => ({
          lat: ll.lat,
          lon: ll.lng,
        }))
        onShapeDrawnRef.current(pts)
      } else if (typeof layer.getLatLng === 'function') {
        const ll = layer.getLatLng() as L.LatLng
        onShapeDrawnRef.current([{ lat: ll.lat, lon: ll.lng }])
      }
    })

    map.on(L.Draw.Event.DELETED, () => {
      onClearRef.current()
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Swap the active draw control based on mission type (polygon / polyline / marker)
  useEffect(() => {
    const map = mapRef.current
    const drawn = drawnRef.current
    if (!map || !drawn) return
    const tool = missionType === 'corridor' ? 'polyline' : missionType === 'orbit' ? 'marker' : 'polygon'
    const control = new L.Control.Draw({
      draw: {
        polygon: tool === 'polygon' ? ({ shapeOptions: { color: '#0ea5e9' } } as any) : false,
        polyline: tool === 'polyline' ? ({ shapeOptions: { color: '#0ea5e9' } } as any) : false,
        marker: tool === 'marker' ? ({} as any) : false,
        rectangle: false,
        circle: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawn, remove: true } as any,
    })
    map.addControl(control)
    return () => {
      map.removeControl(control)
    }
  }, [missionType])

  // Redraw the actual flight path (leg-colored), drone-facing arrows, and orbit guide
  useEffect(() => {
    const layer = pathRef.current
    if (!layer) return
    layer.clearLayers()

    // Orbit guide (center + radius) — drawn even before the ring exists
    if (missionType === 'orbit' && polygon && polygon[0] && orbitRadiusM) {
      L.circle([polygon[0].lat, polygon[0].lon], {
        radius: orbitRadiusM, color: '#0ea5e9', weight: 1, fill: false, dashArray: '4',
      }).addTo(layer)
      L.circleMarker([polygon[0].lat, polygon[0].lon], { radius: 4, color: '#0ea5e9', fillOpacity: 1 })
        .bindTooltip('Center')
        .addTo(layer)
    }

    if (waypoints.length < 2) return

    // Path, colored per battery leg (seed each group with the previous point to connect).
    type Group = { leg: number; pts: [number, number][] }
    const groups: Group[] = []
    for (const wp of waypoints) {
      const leg = wp.leg ?? 0
      const last = groups[groups.length - 1]
      const ll: [number, number] = [wp.lat, wp.lon]
      if (!last || last.leg !== leg) {
        const seed: [number, number][] = last ? [last.pts[last.pts.length - 1]] : []
        groups.push({ leg, pts: [...seed, ll] })
      } else {
        last.pts.push(ll)
      }
    }
    for (const g of groups) {
      L.polyline(g.pts, { color: LEG_COLORS[g.leg % LEG_COLORS.length], weight: 2, opacity: 0.9 }).addTo(layer)
    }

    // Drone-facing arrows (▲ points north; rotate clockwise by heading).
    const step = Math.max(1, Math.floor(waypoints.length / MAX_ARROWS))
    for (let i = 0; i < waypoints.length; i += step) {
      const wp = waypoints[i]
      const h = wp.heading ?? 0
      const icon = L.divIcon({
        className: 'drone-arrow',
        html: `<div style="transform:rotate(${h}deg);color:#0ea5e9;font-size:14px;line-height:1">▲</div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
      L.marker([wp.lat, wp.lon], { icon, interactive: false }).addTo(layer)
    }

    const first: [number, number] = [waypoints[0].lat, waypoints[0].lon]
    const last: [number, number] = [waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lon]
    L.circleMarker(first, { radius: 6, color: '#0ea5e9', fillOpacity: 1 }).bindTooltip('Start').addTo(layer)
    L.circleMarker(last, { radius: 6, color: '#10b981', fillOpacity: 1 }).bindTooltip('End').addTo(layer)
  }, [waypoints, missionType, polygon, orbitRadiusM])

  return (
    <div className="plan-map">
      <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Jump-to-coordinate box (North = lat, East = lon; Enter to recenter) */}
      <div
        className="plan-coord-box"
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 800,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,.92)', border: '1px solid #e2e8f0',
          borderRadius: 6, padding: '6px 8px', boxShadow: '0 2px 8px rgba(15,23,42,.12)',
        }}
      >
        <input
          value={north}
          onChange={(e) => setNorth(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') recenter() }}
          placeholder="North (lat)"
          inputMode="decimal"
          aria-label="North latitude"
          style={{ width: 92, fontSize: 12, boxSizing: 'border-box' }}
        />
        <input
          value={east}
          onChange={(e) => setEast(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') recenter() }}
          placeholder="East (lon)"
          inputMode="decimal"
          aria-label="East longitude"
          style={{ width: 92, fontSize: 12, boxSizing: 'border-box' }}
        />
        <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={recenter}>
          Go
        </button>
        {coordError && <span style={{ color: '#ef4444', fontSize: 11 }}>{coordError}</span>}
      </div>

      {stats && (
        <div className="plan-stats-bar">
          <span>Area <strong>{stats.areaHa.toFixed(1)} ha</strong></span>
          <span>Images <strong>{stats.imageCount}</strong></span>
          <span>Distance <strong>{(stats.distanceM / 1000).toFixed(2)} km</strong></span>
          <span>Time <strong>{fmtTime(stats.flightTimeSec)}</strong></span>
          <span>Batteries <strong>{stats.batteryCount}</strong></span>
          <span>GSD <strong style={{ color: '#0ea5e9' }}>{stats.gsdCm.toFixed(2)} cm/px</strong></span>
        </div>
      )}
    </div>
  )
}
