'use client'

import { useEffect } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import type { GridPanel } from '@/lib/api'
import { API_BASE } from '@/lib/api'

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#0284c7',
}

export type OrthoMapProps = {
  parkId: string
  orthoName: string
  bounds: { west: number; south: number; east: number; north: number }
  center: { lat: number; lon: number }
  panels: GridPanel[]
}

function BoundsFitter({ bounds }: { bounds: OrthoMapProps['bounds'] }) {
  const map = useMap()

  useEffect(() => {
    map.fitBounds([
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    ])
  }, [map, bounds])

  return null
}

export function OrthoMap({ parkId, orthoName, bounds, center, panels }: OrthoMapProps) {
  const tileUrl = `${API_BASE}/park/${encodeURIComponent(parkId)}/ortho/${encodeURIComponent(
    orthoName,
  )}/tiles/{z}/{x}/{y}.png`
  const panelsWithGps = panels.filter((panel) => panel.gps !== null)

  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={16}
      style={{ height: 420, width: '100%', borderRadius: 8 }}
    >
      <BoundsFitter bounds={bounds} />
      <TileLayer
        url={tileUrl}
        attribution="Axalon orthomosaic"
        maxZoom={24}
        tileSize={256}
      />
      {panelsWithGps.map((panel) => {
        const color = SEVERITY_COLOR[panel.worst_severity ?? ''] ?? '#64748b'
        return (
          <CircleMarker
            key={panel.panel_id}
            center={[panel.gps!.lat, panel.gps!.lon]}
            radius={6}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
          >
            <Popup>
              <strong>{panel.panel_id}</strong>
              <br />
              {panel.worst_severity ?? 'No detections'} · {panel.detection_count} fault
              {panel.detection_count !== 1 ? 's' : ''}
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
