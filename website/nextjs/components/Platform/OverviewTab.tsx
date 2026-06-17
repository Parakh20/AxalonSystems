// website/nextjs/components/Platform/OverviewTab.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { api, ApiError, type TrendPoint } from '@/lib/api'
import { useParks } from '@/components/Platform/hooks/useParks'
import { aggregatePortfolio, SEVERITIES, type PortfolioSummary, type Severity } from '@/lib/analytics'
import { TrendChart } from '@/components/Platform/TrendChart'
import { useToast } from '@/components/Platform/Toast'
import { ErrorBanner } from '@/components/Platform/ErrorBanner'
import { SkeletonBlock } from '@/components/Platform/Skeleton'

type OverviewTabProps = {
  onTabChange?: (tab: 'operations') => void
}

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#2563eb',
}

function Kpi({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="panel" style={{ flex: '1 1 120px', padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? '#0f172a' }}>{value}</div>
    </div>
  )
}

function SeverityBars({ bySeverity }: { bySeverity: Record<Severity, number> }) {
  const max = Math.max(1, ...SEVERITIES.map((s) => bySeverity[s]))
  return (
    <div className="plan-param">
      {SEVERITIES.map((s) => (
        <div key={s} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569' }}>
            <span>{s}</span><span>{bySeverity[s]}</span>
          </div>
          <div style={{ background: '#eef2f7', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${(bySeverity[s] / max) * 100}%`, height: '100%', background: SEV_COLOR[s] }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function OverviewTab({ onTabChange }: OverviewTabProps = {}) {
  const toast = useToast()
  const { parks, loading: parksLoading } = useParks()
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [worstTrend, setWorstTrend] = useState<TrendPoint[]>([])
  const [worstName, setWorstName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (parksLoading) return
    if (parks.length === 0) {
      setSummary(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      // Single aggregated call; fall back to the per-park fan-out for older APIs.
      let bundles: { park: (typeof parks)[number]; trend: TrendPoint[] }[]
      try {
        bundles = await api.analyticsOverview()
      } catch {
        bundles = await Promise.all(
          parks.map(async (park) => {
            try {
              return { park, trend: await api.parkTrend(park.id) }
            } catch {
              return { park, trend: [] as TrendPoint[] }
            }
          }),
        )
      }
      if (cancelled) return
      const agg = aggregatePortfolio(bundles)
      const worst = bundles.find((b) => b.park.id === agg.worstParkId)
      setSummary(agg)
      setWorstTrend(worst?.trend ?? [])
      setWorstName(worst?.park.name ?? worst?.park.id ?? '')
      setLoading(false)
    })().catch((err) => {
      if (cancelled) return
      setLoading(false)
      const msg = err instanceof ApiError ? err.message : String(err)
      setError(msg)
      toast.error(msg)
    })
    return () => {
      cancelled = true
    }
  }, [parks, parksLoading, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  if (!parksLoading && parks.length === 0) {
    return (
      <div className="ax-empty-state">
        <div className="ax-empty-state-icon">
          <BarChart3 size={26} />
        </div>
        <p>No parks yet. Upload your first batch inspection to get started.</p>
        <button type="button" onClick={() => onTabChange?.('operations')}>
          Go to Operations
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>Portfolio Overview</h2>

      {error && <ErrorBanner message={error} onRetry={retry} />}

      {/* KPIs */}
      {!summary && loading ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel" style={{ flex: '1 1 120px', padding: '12px 14px' }}>
              <SkeletonBlock height={48} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <Kpi label="Parks" value={summary?.parkCount ?? (loading ? '…' : 0)} />
          <Kpi label="Inspections" value={summary?.inspectionCount ?? (loading ? '…' : 0)} />
          <Kpi label="Total faults" value={summary?.totalFaults ?? (loading ? '…' : 0)} />
          <Kpi label="Critical" value={summary?.bySeverity.CRITICAL ?? (loading ? '…' : 0)} color={SEV_COLOR.CRITICAL} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Severity breakdown */}
        <section className="panel" style={{ flex: '1 1 280px' }}>
          <div className="panel-head compact"><div className="panel-title">Faults by severity</div></div>
          {summary ? <SeverityBars bySeverity={summary.bySeverity} /> : <div className="plan-param muted" style={{ fontSize: 12 }}>Loading…</div>}
        </section>

        {/* Parks ranked by critical */}
        <section className="panel" style={{ flex: '1 1 280px' }}>
          <div className="panel-head compact"><div className="panel-title">Parks by critical faults</div></div>
          <div className="plan-param">
            {!summary && <div className="muted" style={{ fontSize: 12 }}>Loading…</div>}
            {summary?.ranked.slice(0, 8).map((p) => (
              <div key={p.id} className="queue-row sub" style={{ padding: '3px 0' }}>
                <span>{p.name}</span>
                <span>
                  <strong style={{ color: SEV_COLOR.CRITICAL }}>{p.critical}</strong>
                  <span className="muted"> / {p.total}</span>
                </span>
              </div>
            ))}
            {summary && summary.ranked.length === 0 && <div className="muted" style={{ fontSize: 12 }}>No data</div>}
          </div>
        </section>
      </div>

      {/* Worst-park trend */}
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head compact">
          <div className="panel-title">Severity trend{worstName ? ` — ${worstName}` : ''}</div>
        </div>
        <div style={{ padding: 8 }}>
          <TrendChart data={worstTrend} />
        </div>
      </section>
    </div>
  )
}
