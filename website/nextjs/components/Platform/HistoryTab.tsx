'use client'

import { History as HistoryIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '@/components/Platform/Toast'
import { useParks } from '@/components/Platform/hooks/useParks'
import { api, ApiError } from '@/lib/api'

type InspectionRow = {
  id: number
  flight_date?: string
  total_images?: number
  total_detections?: number
  summary?: Record<string, number>
}

type ParkSummary = {
  park_id: string
  name?: string
  mode?: string
  total_panels?: number
  total_inspections?: number
  inspections?: InspectionRow[]
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

function HistoryChart({ inspections }: { inspections: InspectionRow[] }) {
  if (!inspections.length) return null
  const points = [...inspections].reverse() // chronological
  const w = 720
  const h = 160
  const pad = 24
  const totalOf = (p: InspectionRow) => p.total_detections ?? 0
  const critOf = (p: InspectionRow) =>
    Number(p.summary?.CRITICAL ?? p.summary?.critical ?? 0)
  const max = Math.max(1, ...points.map(totalOf))
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0
  const px = (i: number) => pad + i * stepX
  const py = (v: number) => h - pad - ((v || 0) / max) * (h - pad * 2)
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(totalOf(p)).toFixed(1)}`)
    .join(' ')
  const critPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(critOf(p)).toFixed(1)}`)
    .join(' ')

  return (
    <div className="chart-card">
      <div className="chart-head">
        <strong>Detections over time</strong>
        <span className="muted">
          <span className="dot" style={{ background: '#111827' }} /> total ·
          <span className="dot" style={{ background: '#dc2626', marginLeft: 8 }} /> critical
        </span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="chart-svg"
      >
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e2e8f0" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e2e8f0" />
        <path d={linePath} fill="none" stroke="#111827" strokeWidth={2} />
        <path d={critPath} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" />
        {points.map((p, i) => (
          <circle key={i} cx={px(i)} cy={py(totalOf(p))} r={3} fill="#111827" />
        ))}
        <text x={pad} y={pad - 6} fontSize="10" fill="#64748b">
          {max}
        </text>
        <text x={pad} y={h - pad + 14} fontSize="10" fill="#64748b">
          0
        </text>
      </svg>
    </div>
  )
}

export function HistoryTab() {
  const toast = useToast()
  const { parks } = useParks()

  const [historyParkId, setHistoryParkId] = useState<string>('')
  const [parkSummary, setParkSummary] = useState<ParkSummary | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Default to first park once loaded
  useEffect(() => {
    if (!historyParkId && parks[0]) {
      setHistoryParkId(parks[0].id)
    }
  }, [parks, historyParkId])

  // Load park summary when historyParkId changes
  useEffect(() => {
    if (!historyParkId) return
    setHistoryLoading(true)
    ;(async () => {
      try {
        const d = await api.park(historyParkId)
        setParkSummary(d as ParkSummary)
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : String(err))
        setParkSummary(null)
      } finally {
        setHistoryLoading(false)
      }
    })()
  }, [historyParkId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="tab-section">
      <header className="cmdbar">
        <div className="cmdbar-titles">
          <div className="eyebrow">
            <HistoryIcon size={13} />
            Inspection history
          </div>
          <h1>History</h1>
        </div>
        <div className="chips">
          <Chip label="Parks" value={String(parks.length)} tone="muted" />
          <Chip
            label="Flights"
            value={String(parkSummary?.total_inspections ?? 0)}
            tone="info"
          />
          <Chip
            label="Latest"
            value={
              parkSummary?.inspections?.[0]?.flight_date
                ? new Date(parkSummary.inspections[0].flight_date!).toLocaleDateString()
                : '—'
            }
            tone="ok"
          />
        </div>
      </header>

      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">Select park</div>
            <p>Pick a park to load its inspection history.</p>
          </div>
          <select
            value={historyParkId}
            onChange={(e) => setHistoryParkId(e.target.value)}
            style={{ minWidth: 220 }}
          >
            {parks.length === 0 && <option value="">No parks</option>}
            {parks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ? `${p.id} — ${p.name}` : p.id}
              </option>
            ))}
          </select>
        </div>

        {historyLoading && <div className="empty">Loading…</div>}
        {!historyLoading && parkSummary && parkSummary.inspections && (
          <>
            <HistoryChart inspections={parkSummary.inspections} />
            <div className="table" style={{ marginTop: 16 }}>
              <div className="table-head hist-head">
                <span>Date</span>
                <span>Images</span>
                <span>Detections</span>
                <span>Critical</span>
                <span>High</span>
              </div>
              {parkSummary.inspections.map((ins) => {
                const summary = ins.summary || {}
                const sevCount = (key: string) =>
                  Number(
                    summary[key] ??
                      summary[key.toUpperCase()] ??
                      summary[key.toLowerCase()] ??
                      0,
                  )
                return (
                  <div className="hist-row" key={ins.id}>
                    <span>
                      {ins.flight_date
                        ? new Date(ins.flight_date).toLocaleString()
                        : `#${ins.id}`}
                    </span>
                    <span>{ins.total_images ?? '—'}</span>
                    <span>{ins.total_detections ?? 0}</span>
                    <span>
                      <strong style={{ color: '#991b1b' }}>{sevCount('CRITICAL')}</strong>
                    </span>
                    <span style={{ color: '#cc5500' }}>{sevCount('HIGH')}</span>
                  </div>
                )
              })}
              {parkSummary.inspections.length === 0 && (
                <div className="empty">No inspections yet for this park.</div>
              )}
            </div>
          </>
        )}
        {!historyLoading && !parkSummary && (
          <div className="empty">Pick a park to see its history.</div>
        )}
      </section>
    </section>
  )
}
