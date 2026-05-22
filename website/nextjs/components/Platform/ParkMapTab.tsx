'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/Platform/Toast'
import { useParks } from '@/components/Platform/hooks/useParks'
import { api, ApiError } from '@/lib/api'
import { ParkMapGrid } from '@/components/Platform/ParkMapGrid'
import { ParkPanelDetail } from '@/components/Platform/ParkPanelDetail'
import type { GridPanel, ParkGrid } from '@/lib/api'

export function ParkMapTab() {
  const toast = useToast()
  const { parks } = useParks()

  const [parkMapParkId, setParkMapParkId] = useState<string>('')
  const [parkMapInspectionId, setParkMapInspectionId] = useState<string>('')
  const [parkMapInspections, setParkMapInspections] = useState<
    Array<{ id: string; flight_date?: string | null; created_at?: string | null }>
  >([])
  const [parkMapGrid, setParkMapGrid] = useState<ParkGrid | null>(null)
  const [parkMapLoading, setParkMapLoading] = useState(false)
  const [parkMapSelectedPanel, setParkMapSelectedPanel] = useState<GridPanel | null>(null)

  // Fetch inspection list when park changes
  useEffect(() => {
    if (!parkMapParkId) {
      setParkMapInspections([])
      setParkMapInspectionId('')
      return
    }
    let cancelled = false
    api
      .park(parkMapParkId)
      .then((summary) => {
        if (cancelled) return
        const list =
          (
            summary as {
              inspections?: Array<{
                id: string
                flight_date?: string | null
                created_at?: string | null
              }>
            }
          ).inspections ?? []
        setParkMapInspections(list)
        // default to most recent if not already chosen
        if (!parkMapInspectionId && list[0]) setParkMapInspectionId(list[0].id)
      })
      .catch((err) => {
        if (cancelled) return
        toast.error(err instanceof ApiError ? err.message : String(err))
        setParkMapInspections([])
      })
    return () => {
      cancelled = true
    }
  }, [parkMapParkId, parkMapInspectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch grid when park/inspection changes
  useEffect(() => {
    if (!parkMapParkId) {
      setParkMapGrid(null)
      return
    }
    let cancelled = false
    setParkMapLoading(true)
    api
      .parkGrid(parkMapParkId, parkMapInspectionId || undefined)
      .then((g) => {
        if (cancelled) return
        setParkMapGrid(g)
        setParkMapSelectedPanel(null)
      })
      .catch((err) => {
        if (cancelled) return
        toast.error(err instanceof ApiError ? err.message : String(err))
        setParkMapGrid(null)
      })
      .finally(() => {
        if (!cancelled) setParkMapLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [parkMapParkId, parkMapInspectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Park Map</h1>
      </header>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#64748b' }}
        >
          Park
          <select
            data-testid="parkmap-park-select"
            value={parkMapParkId}
            onChange={(e) => {
              setParkMapParkId(e.target.value)
              setParkMapInspectionId('')
            }}
            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6 }}
          >
            <option value="">— select a park —</option>
            {parks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
                {p.name ? ` — ${p.name}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#64748b' }}
        >
          Inspection
          <select
            data-testid="parkmap-inspection-select"
            value={parkMapInspectionId}
            onChange={(e) => setParkMapInspectionId(e.target.value)}
            disabled={parkMapInspections.length === 0}
            style={{
              padding: '6px 10px',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              minWidth: 220,
            }}
          >
            <option value="">— most recent —</option>
            {parkMapInspections.map((i) => (
              <option key={i.id} value={i.id}>
                {i.id}
                {i.flight_date ? ` (${i.flight_date})` : ''}
              </option>
            ))}
          </select>
        </label>

        {parkMapLoading ? (
          <span style={{ fontSize: 12, color: '#64748b' }}>Loading…</span>
        ) : null}
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16 }}
      >
        <ParkMapGrid
          grid={parkMapGrid}
          selectedPanelId={parkMapSelectedPanel?.panel_id ?? null}
          onSelect={(p) => setParkMapSelectedPanel(p)}
        />
        <ParkPanelDetail
          panel={parkMapSelectedPanel}
          jobId={parkMapGrid?.inspection_id ?? null}
          onClose={() => setParkMapSelectedPanel(null)}
        />
      </div>
    </section>
  )
}
