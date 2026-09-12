'use client'

import { LayoutGrid, Trash2, UploadCloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/Platform/Toast'
import { api, ApiError } from '@/lib/api'
import { layoutFileKind, layoutModeLabel } from '@/lib/parkLayout'
import type { ParkLayoutStatus } from '@/lib/parkLayout'

const controlStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: '#0ea5e9',
  background: 'transparent',
  border: 'none',
  padding: 0,
}

/** Shows whether a park localises against a manual layout or auto-grid, and manages the layout file. */
export function ParkLayoutControl({ parkId }: { parkId: string }) {
  const toast = useToast()
  const [status, setStatus] = useState<ParkLayoutStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatus(null)
    api
      .parkLayout(parkId)
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [parkId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!layoutFileKind(file.name)) {
      toast.error('Layout must be a .json layout or a .geojson FeatureCollection')
      return
    }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.uploadParkLayout(parkId, form)
      setStatus({ ...res, error: null })
      toast.success(`Manual layout stored: ${res.summary?.total_panels ?? 0} panels`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Layout upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleRevert() {
    if (!window.confirm(`Remove the manual layout for ${parkId} and use auto-grid?`)) return
    setBusy(true)
    try {
      await api.deleteParkLayout(parkId)
      setStatus({ park_id: parkId, mode: 'auto', summary: null, error: null })
      toast.success('Park reverted to auto-grid')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove layout')
    } finally {
      setBusy(false)
    }
  }

  const isManual = status?.mode === 'manual'
  const invalid = isManual && (status?.error || !status?.summary)

  return (
    <div
      data-testid="parkmap-layout-control"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
    >
      <span
        data-testid="parkmap-layout-mode"
        title={status?.error ?? undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          border: '1px solid #cbd5e1',
          color: invalid ? '#dc2626' : isManual ? '#0f766e' : '#64748b',
        }}
      >
        <LayoutGrid size={13} />
        {layoutModeLabel(status)}
      </span>
      <label style={{ ...controlStyle, cursor: busy ? 'progress' : 'pointer' }}>
        <UploadCloud size={14} />
        <input
          type="file"
          hidden
          accept=".json,.geojson,application/json,application/geo+json"
          onChange={handleUpload}
          disabled={busy}
        />
        {isManual ? 'Replace layout' : 'Upload layout'}
      </label>
      {isManual && (
        <button
          type="button"
          onClick={handleRevert}
          disabled={busy}
          style={{ ...controlStyle, color: '#64748b', cursor: busy ? 'progress' : 'pointer' }}
        >
          <Trash2 size={14} />
          Use auto-grid
        </button>
      )}
    </div>
  )
}
