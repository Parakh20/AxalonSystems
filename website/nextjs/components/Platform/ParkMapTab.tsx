'use client'

import { Download, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DynamicOrthoMap } from '@/components/Platform/DynamicOrthoMap'
import { useToast } from '@/components/Platform/Toast'
import { useParks } from '@/components/Platform/hooks/useParks'
import { api, ApiError } from '@/lib/api'
import { ParkMapGrid } from '@/components/Platform/ParkMapGrid'
import { ParkPanelDetail } from '@/components/Platform/ParkPanelDetail'
import type { GridPanel, OrthoMeta, ParkGrid } from '@/lib/api'

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
  const [orthos, setOrthos] = useState<OrthoMeta[]>([])
  const [orthoView, setOrthoView] = useState(false)
  const [orthoUploading, setOrthoUploading] = useState(false)

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

  useEffect(() => {
    if (!parkMapParkId) {
      setOrthos([])
      setOrthoView(false)
      return
    }
    let cancelled = false
    api
      .orthos(parkMapParkId)
      .then((list) => {
        if (!cancelled) {
          setOrthos(list)
          if (list.length === 0) setOrthoView(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrthos([])
          setOrthoView(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [parkMapParkId])

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

  async function handleOrthoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !parkMapParkId) return
    setOrthoUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const meta = await api.uploadOrtho(parkMapParkId, form)
      setOrthos((prev) => [...prev.filter((o) => o.name !== meta.name), meta])
      setOrthoView(true)
      toast.success(`Ortho "${meta.name}" uploaded`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed')
    } finally {
      setOrthoUploading(false)
      e.target.value = ''
    }
  }

  async function exportGridPng() {
    if (!parkMapParkId) return
    try {
      const blob = await api.parkGridPng(parkMapParkId, parkMapInspectionId || undefined)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${parkMapParkId}_grid.png`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    }
  }

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

      {parkMapParkId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setOrthoView(false)}
              style={{
                padding: '5px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: !orthoView ? '#0ea5e9' : 'transparent',
                color: !orthoView ? '#fff' : '#64748b',
                border: '1px solid #cbd5e1',
              }}
            >
              Grid
            </button>
            <button
              onClick={() => setOrthoView(true)}
              disabled={orthos.length === 0}
              style={{
                padding: '5px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: orthos.length > 0 ? 'pointer' : 'not-allowed',
                background: orthoView ? '#0ea5e9' : 'transparent',
                color: orthoView ? '#fff' : '#64748b',
                border: '1px solid #cbd5e1',
                opacity: orthos.length === 0 ? 0.5 : 1,
              }}
            >
              Map {orthos.length > 0 ? `(${orthos.length})` : ''}
            </button>
          </div>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              cursor: orthoUploading ? 'progress' : 'pointer',
              color: '#0ea5e9',
            }}
          >
            <UploadCloud size={14} />
            <input
              type="file"
              hidden
              accept=".tif,.tiff"
              onChange={handleOrthoUpload}
              disabled={orthoUploading}
            />
            {orthoUploading ? 'Uploading...' : 'Upload Ortho'}
          </label>
          {parkMapGrid && (
            <button
              data-testid="parkmap-export-png"
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: 'transparent',
                color: '#64748b',
                border: '1px solid #cbd5e1',
              }}
              onClick={exportGridPng}
            >
              <Download size={14} />
              Export PNG
            </button>
          )}
        </div>
      )}

      {orthoView && orthos[0] ? (
        <DynamicOrthoMap
          parkId={parkMapParkId}
          orthoName={orthos[0].name}
          bounds={orthos[0].bounds}
          center={orthos[0].center}
          panels={parkMapGrid?.panels ?? []}
        />
      ) : (
        <div
          className="park-map-layout"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16 }}
        >
          <ParkMapGrid
            grid={parkMapGrid}
            selectedPanelId={parkMapSelectedPanel?.panel_id ?? null}
            onSelect={(p) => setParkMapSelectedPanel(p)}
          />
          <div className={`park-panel-detail ${parkMapSelectedPanel ? 'is-open' : ''}`}>
            <ParkPanelDetail
              panel={parkMapSelectedPanel}
              jobId={parkMapGrid?.inspection_id ?? null}
              onClose={() => setParkMapSelectedPanel(null)}
            />
          </div>
        </div>
      )}
    </section>
  )
}
