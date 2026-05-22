'use client'

import { ImageIcon as ImageIconLucide, Play, RefreshCw, UploadCloud } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/Platform/Toast'
import { api, ApiError } from '@/lib/api'

type InspectDetection = {
  class: string
  class_id: number
  confidence: number
  severity: string
  bbox: [number, number, number, number]
}

type InspectResult = {
  job_id: string
  status: string
  total_detections: number
  summary?: {
    by_severity?: Record<string, number>
    [k: string]: unknown
  }
  detections: InspectDetection[]
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'info' | 'ok' | 'crit' | 'muted'
}) {
  return (
    <div className={`chip chip-${tone}`}>
      <span className="chip-label">{label}</span>
      <span className="chip-value">{value}</span>
    </div>
  )
}

function InspectPreview({
  file,
  detections,
}: {
  file: File
  detections: InspectDetection[]
}) {
  const [url, setUrl] = useState<string>('')
  const [nat, setNat] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const sevColor: Record<string, string> = {
    CRITICAL: '#dc2626',
    HIGH: '#ea580c',
    MEDIUM: '#ca8a04',
    LOW: '#0284c7',
  }

  return (
    <div className="inspect-preview-wrap">
      {url && (
        <img
          src={url}
          alt="thermal preview"
          className="inspect-preview"
          onLoad={(e) => {
            const img = e.currentTarget
            setNat({ w: img.naturalWidth, h: img.naturalHeight })
          }}
        />
      )}
      {nat.w > 0 &&
        detections.map((d, i) => {
          const [x1, y1, x2, y2] = d.bbox
          const left = (x1 / nat.w) * 100
          const top = (y1 / nat.h) * 100
          const width = ((x2 - x1) / nat.w) * 100
          const height = ((y2 - y1) / nat.h) * 100
          const color = sevColor[d.severity] || '#0ea5e9'
          return (
            <div
              key={i}
              className="bbox"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
                borderColor: color,
                boxShadow: `0 0 0 1px ${color}33`,
              }}
              title={`${d.class} · ${Math.round(d.confidence * 100)}%`}
            >
              <span style={{ background: color }}>{d.class}</span>
            </div>
          )
        })}
    </div>
  )
}

export function InspectTab() {
  const toast = useToast()
  const inspectInput = useRef<HTMLInputElement>(null)
  const [inspectFile, setInspectFile] = useState<File | null>(null)
  const [inspectBusy, setInspectBusy] = useState(false)
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null)
  const [inspectError, setInspectError] = useState<string | null>(null)
  const [altitude] = useState(42)

  async function runInspect() {
    if (!inspectFile) return
    setInspectBusy(true)
    setInspectError(null)
    setInspectResult(null)
    const form = new FormData()
    form.append('thermal_image', inspectFile)
    form.append('park_id', 'unknown')
    form.append('altitude_m', String(altitude))
    try {
      const data = await api.inspect(form)
      setInspectResult(data as InspectResult)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Inspect failed'
      setInspectError(msg)
      toast.error(msg)
    } finally {
      setInspectBusy(false)
    }
  }

  return (
    <section className="tab-section">
      <header className="cmdbar">
        <div className="cmdbar-titles">
          <div className="eyebrow">
            <ImageIconLucide size={13} />
            Single image debug
          </div>
          <h1>Inspect</h1>
        </div>
        <div className="chips">
          <Chip
            label="Total"
            value={String(inspectResult?.total_detections ?? 0)}
            tone="info"
          />
          <Chip
            label="Critical"
            value={String(
              inspectResult?.summary?.by_severity?.CRITICAL ??
                inspectResult?.summary?.CRITICAL ??
                inspectResult?.summary?.critical ??
                0,
            )}
            tone="crit"
          />
          <Chip
            label="High"
            value={String(
              inspectResult?.summary?.by_severity?.HIGH ??
                inspectResult?.summary?.HIGH ??
                inspectResult?.summary?.high ??
                0,
            )}
            tone="muted"
          />
        </div>
      </header>

      <div className="grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Thermal image</div>
              <p>JPG, PNG, or TIFF. Single frame only.</p>
            </div>
            <UploadCloud size={24} />
          </div>
          <div
            className="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) setInspectFile(f)
            }}
            onClick={() => inspectInput.current?.click()}
          >
            <input
              ref={inspectInput}
              type="file"
              accept=".jpg,.jpeg,.png,.tif,.tiff"
              hidden
              onChange={(e) => setInspectFile(e.target.files?.[0] || null)}
            />
            <div>
              <UploadCloud size={34} />
              <strong>{inspectFile ? inspectFile.name : 'Drop image or click to browse'}</strong>
              <span className="muted">conf 0.25 · imgsz 640</span>
            </div>
          </div>
          <button
            className="primary"
            disabled={!inspectFile || inspectBusy}
            onClick={runInspect}
          >
            {inspectBusy ? <RefreshCw size={17} /> : <Play size={17} />}
            Run detection
          </button>
          {inspectError && <div className="note error">{inspectError}</div>}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Result</div>
              <p>
                {inspectResult
                  ? `${inspectResult.total_detections} detection(s) · job ${inspectResult.job_id}`
                  : 'No result yet.'}
              </p>
            </div>
          </div>
          {inspectFile && (
            <InspectPreview file={inspectFile} detections={inspectResult?.detections ?? []} />
          )}
          {inspectResult && inspectResult.detections.length > 0 && (
            <div className="table">
              <div className="table-head insp-head">
                <span>Class</span>
                <span>Severity</span>
                <span>Conf</span>
              </div>
              {inspectResult.detections.map((d, i) => (
                <div className="insp-row" key={i}>
                  <span>
                    <strong>{d.class}</strong>
                  </span>
                  <span>
                    <span className={`severity ${d.severity.toLowerCase()}`}>{d.severity}</span>
                  </span>
                  <span>{Math.round(d.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          )}
          {!inspectResult && !inspectFile && !inspectBusy && (
            <div className="empty">Upload an image to see annotated detections.</div>
          )}
        </section>
      </div>
    </section>
  )
}
