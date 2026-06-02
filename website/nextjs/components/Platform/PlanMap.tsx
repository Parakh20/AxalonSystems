// website/nextjs/components/Platform/PlanMap.tsx
'use client'

import { useEffect, useRef } from 'react'
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

type Props = {
  missionType: MissionType
  polygon: LatLon[] | null
  waypoints: Waypoint[]
  stats: MissionStats | null
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
  waypoints,
  stats,
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

  // Initialise map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    const map = L.map(mapDivRef.current, { center: [18.5204, 73.8567], zoom: 16 })
    L.tileLayer(SAT_URL, { attribution: SAT_ATTR, maxZoom: 22 }).addTo(map)

    const drawn = new L.FeatureGroup()
    map.addLayer(drawn)
    drawnRef.current = drawn
    pathRef.current = L.layerGroup().addTo(map)

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawn.clearLayers()
      const layer = e.layer
      drawn.addLayer(layer)
      const raw = layer.getLatLngs?.()
      const latlngs = (Array.isArray(raw?.[0]) ? raw[0] : raw ?? []) as L.LatLng[]
      const pts: LatLon[] = (Array.isArray(latlngs) ? latlngs : []).map((ll: L.LatLng) => ({
        lat: ll.lat,
        lon: ll.lng,
      }))
      onShapeDrawnRef.current(pts)
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

  // Swap the active draw control based on mission type (polygon vs polyline)
  useEffect(() => {
    const map = mapRef.current
    const drawn = drawnRef.current
    if (!map || !drawn) return
    const useLine = missionType === 'corridor'
    const control = new L.Control.Draw({
      draw: {
        polygon: useLine ? false : ({ shapeOptions: { color: '#0ea5e9' } } as any),
        polyline: useLine ? ({ shapeOptions: { color: '#0ea5e9' } } as any) : false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawn, remove: true } as any,
    })
    map.addControl(control)
    return () => {
      map.removeControl(control)
    }
  }, [missionType])

  // Redraw waypoint path whenever waypoints change
  useEffect(() => {
    const layer = pathRef.current
    if (!layer) return
    layer.clearLayers()
    if (waypoints.length < 2) return
    const latlngs = waypoints.map((w) => [w.lat, w.lon] as [number, number])
    L.polyline(latlngs, { color: '#06b6d4', weight: 2, opacity: 0.9 }).addTo(layer)
    L.circleMarker(latlngs[0], { radius: 6, color: '#0ea5e9', fillOpacity: 1 })
      .bindTooltip('Start')
      .addTo(layer)
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#10b981', fillOpacity: 1 })
      .bindTooltip('End')
      .addTo(layer)
  }, [waypoints])

  return (
    <div className="plan-map">
      <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }} />
      {stats && (
        <div className="plan-stats-bar">
          <span>Area <strong>{stats.areaHa.toFixed(1)} ha</strong></span>
          <span>Images <strong>{stats.imageCount}</strong></span>
          <span>Distance <strong>{(stats.distanceM / 1000).toFixed(2)} km</strong></span>
          <span>Time <strong>{fmtTime(stats.flightTimeSec)}</strong></span>
          <span>GSD <strong style={{ color: '#0ea5e9' }}>{stats.gsdCm.toFixed(2)} cm/px</strong></span>
        </div>
      )}
    </div>
  )
}
