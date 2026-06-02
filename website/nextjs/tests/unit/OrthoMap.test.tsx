import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({ children }: { children: ReactNode }) => (
    <div data-testid="circle-marker">{children}</div>
  ),
  Popup: ({ children }: { children: ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: vi.fn() }),
}))

vi.mock('leaflet', () => ({ default: {}, latLngBounds: vi.fn() }))

import { OrthoMap } from '@/components/Platform/OrthoMap'

const BOUNDS = { west: 71.9, south: 27.5, east: 71.95, north: 27.55 }

const PANELS = [
  {
    panel_id: 'R1-C1',
    row: 0,
    col: 0,
    worst_severity: 'CRITICAL' as const,
    detection_count: 2,
    detections: [],
    gps: { lat: 27.52, lon: 71.92 },
  },
  {
    panel_id: 'R1-C2',
    row: 0,
    col: 1,
    worst_severity: null,
    detection_count: 0,
    detections: [],
    gps: null,
  },
]

describe('OrthoMap', () => {
  test('renders map container', () => {
    render(
      <OrthoMap
        parkId="DEMO"
        orthoName="ortho.tif"
        bounds={BOUNDS}
        center={{ lat: 27.52, lon: 71.92 }}
        panels={PANELS}
      />,
    )

    expect(screen.getByTestId('map-container')).toBeInTheDocument()
  })

  test('renders one tile layer', () => {
    render(
      <OrthoMap
        parkId="DEMO"
        orthoName="ortho.tif"
        bounds={BOUNDS}
        center={{ lat: 27.52, lon: 71.92 }}
        panels={PANELS}
      />,
    )

    expect(screen.getByTestId('tile-layer')).toBeInTheDocument()
  })

  test('renders circle markers only for panels with GPS', () => {
    render(
      <OrthoMap
        parkId="DEMO"
        orthoName="ortho.tif"
        bounds={BOUNDS}
        center={{ lat: 27.52, lon: 71.92 }}
        panels={PANELS}
      />,
    )

    expect(screen.getAllByTestId('circle-marker')).toHaveLength(1)
  })
})
