'use client'

import { Layers, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import {
  isOdmJobActive,
  odmCapability,
  odmProgressLabel,
  validateOdmZip,
  type OdmCapability,
  type OdmJob,
  type OdmSensor,
} from '@/lib/odm'

export type OrthoGeneratorProps = {
  parkId: string
  /** Called once a generation finishes and the new ortho is registered. */
  onOrthoReady: (orthoName: string) => void
  pollMs?: number
}

const DEFAULT_POLL_MS = 5_000
const MUTED = '#64748b'
const ACCENT = '#0ea5e9'
const DANGER = '#dc2626'

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message : fallback
}

export function OrthoGenerator({ parkId, onOrthoReady, pollMs = DEFAULT_POLL_MS }: OrthoGeneratorProps) {
  const [capability, setCapability] = useState<OdmCapability | null>(null)
  const [job, setJob] = useState<OdmJob | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [sensor, setSensor] = useState<OdmSensor>('auto')
  const [resolutionCm, setResolutionCm] = useState(2)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const onReadyRef = useRef(onOrthoReady)
  onReadyRef.current = onOrthoReady

  useEffect(() => {
    let cancelled = false
    api
      .health()
      .then((h) => !cancelled && setCapability(odmCapability(h)))
      .catch(() => !cancelled && setCapability({ configured: false, message: 'Backend unreachable' }))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setJob(null)
    setFormOpen(false)
    setFormError(null)
    api
      .orthoGenerationJobs(parkId)
      .then((jobs) => !cancelled && setJob(jobs[0] ?? null))
      .catch(() => {
        // No history is not an error worth surfacing — the button still works.
      })
    return () => {
      cancelled = true
    }
  }, [parkId])

  const activeJobId = job && isOdmJobActive(job) ? job.job_id : null

  useEffect(() => {
    if (!activeJobId) return
    let stopped = false
    const timer = setInterval(async () => {
      try {
        const next = await api.orthoGenerationStatus(parkId, activeJobId)
        if (stopped) return
        setJob(next)
        if (next.state === 'succeeded' && next.ortho_name) onReadyRef.current(next.ortho_name)
      } catch {
        // Transient poll failure — keep polling; the next tick usually succeeds.
      }
    }, pollMs)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [activeJobId, parkId, pollMs])

  async function start() {
    const invalid = validateOdmZip(file)
    if (invalid || !file) {
      setFormError(invalid)
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('images', file)
      form.append('sensor', sensor)
      form.append('orthophoto_resolution_cm', String(resolutionCm))
      setJob(await api.generateOrtho(parkId, form))
      setFormOpen(false)
      setFile(null)
    } catch (err) {
      setFormError(errorText(err, 'Upload failed'))
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel() {
    if (!job) return
    try {
      setJob(await api.cancelOrthoGeneration(parkId, job.job_id))
    } catch (err) {
      setFormError(errorText(err, 'Cancel failed'))
    }
  }

  const configured = capability?.configured === true
  const busy = Boolean(activeJobId) || submitting
  const pct = job ? Math.round(Math.min(Math.max(job.progress, 0), 1) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          disabled={!configured || busy}
          title={capability && !configured ? (capability.message ?? undefined) : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 14px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            background: 'transparent',
            color: configured && !busy ? ACCENT : MUTED,
            border: '1px solid #cbd5e1',
            cursor: configured && !busy ? 'pointer' : 'not-allowed',
            opacity: configured && !busy ? 1 : 0.6,
          }}
        >
          <Layers size={14} />
          Generate orthomosaic
        </button>
        {capability && !configured && (
          <span style={{ fontSize: 12, color: MUTED }}>{capability.message}</span>
        )}
      </div>

      {formOpen && configured && (
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            padding: 12,
            border: '1px solid #e2e8f0',
            borderRadius: 8,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED }}>
            Images ZIP
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED }}>
            Camera
            <select
              value={sensor}
              onChange={(e) => setSensor(e.target.value as OdmSensor)}
              style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }}
            >
              <option value="auto">Auto (RGB if present)</option>
              <option value="rgb">RGB</option>
              <option value="thermal">Thermal</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: MUTED }}>
            Resolution (cm/px)
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              value={resolutionCm}
              onChange={(e) => setResolutionCm(Number(e.target.value))}
              style={{ width: 80, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 6 }}
            />
          </label>
          <button
            type="button"
            onClick={start}
            disabled={submitting}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: ACCENT,
              color: '#fff',
              border: 'none',
              cursor: submitting ? 'progress' : 'pointer',
            }}
          >
            {submitting ? 'Uploading…' : 'Start generation'}
          </button>
          <span style={{ fontSize: 11, color: MUTED, flexBasis: '100%' }}>
            Geotagged images from one camera, max 2 GB. Stitching runs on the NodeODM server and can
            take from minutes to hours.
          </span>
        </div>
      )}

      {formError && (
        <div role="alert" style={{ fontSize: 12, color: DANGER }}>
          {formError}
        </div>
      )}

      {job && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
          {isOdmJobActive(job) && (
            <div
              role="progressbar"
              aria-label="Orthomosaic generation progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              style={{ width: 160, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}
            >
              <div style={{ width: `${pct}%`, height: '100%', background: ACCENT, transition: 'width 300ms' }} />
            </div>
          )}
          {job.state === 'failed' ? (
            <span role="alert" style={{ color: DANGER }}>
              {odmProgressLabel(job)}
            </span>
          ) : (
            <span style={{ color: job.state === 'succeeded' ? '#16a34a' : MUTED }}>{odmProgressLabel(job)}</span>
          )}
          {isOdmJobActive(job) && (
            <button
              type="button"
              onClick={cancel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 10px',
                borderRadius: 6,
                fontSize: 12,
                background: 'transparent',
                color: DANGER,
                border: `1px solid ${DANGER}`,
                cursor: 'pointer',
              }}
            >
              <X size={12} />
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
