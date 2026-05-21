'use client'

import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileJson,
  FileSpreadsheet,
  FileText,
  History as HistoryIcon,
  Image as ImageIcon,
  LayoutDashboard,
  MapIcon,
  Play,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  UploadCloud,
  Wifi,
  XCircle,
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ToastProvider, useToast } from '@/components/Platform/Toast'
import { api, ApiError, API_BASE } from '@/lib/api'
import {
  useMapData,
  type Anomaly as MapAnomaly,
  type BasemapId,
  type OrthoMeta,
  type ViewMode,
} from '@/components/Platform/AnomalyMap'

const AnomalyMap = dynamic(() => import('@/components/Platform/AnomalyMap'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 360,
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        background: '#f1f5f9',
        display: 'grid',
        placeItems: 'center',
        color: '#64748b',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      Loading map…
    </div>
  ),
})

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'
type Severity = 'critical' | 'high' | 'medium' | 'low'
type ReportFormat = 'pdf' | 'excel' | 'json' | 'geojson'

type BatchJob = {
  id: string
  parkId: string
  fileName: string
  status: JobStatus
  progress: number
  processed: number
  total: number
  altitude: number
  createdAt: string
  detections: Record<Severity, number>
  error?: string
}

type Finding = {
  id: string
  module: string
  className: string
  severity: Severity
  confidence: number
  action: string
}

const SEVERITY_ACTION: Record<Severity, string> = {
  critical: 'Dispatch crew and isolate string before next peak load window.',
  high:     'Schedule electrical test and lock report to maintenance queue.',
  medium:   'Review RGB companion frame for cracking or shade source.',
  low:      'Group into next cleaning route.',
}

function findingFromAnomaly(a: MapAnomaly): Finding {
  const sev = a.severity.toLowerCase() as Severity
  return {
    id: a.id,
    module: a.panel_id || 'N/A',
    className: a.class || 'unknown',
    severity: sev,
    confidence: a.confidence,
    action: SEVERITY_ACTION[sev] ?? '',
  }
}

type Health = {
  status: string
  model: string
  version: string
  db: string
  parks_in_db: number
}

type Tab = 'operations' | 'inspect' | 'history' | 'settings'

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

type SettingsBlob = Record<string, Record<string, unknown>>

const demoJobs: BatchJob[] = [
  {
    id: 'batch-8f24c91a',
    parkId: 'MH_SOLAR_07',
    fileName: 'mh_solar_07_morning_pass.zip',
    status: 'processing',
    progress: 0.64,
    processed: 896,
    total: 1400,
    altitude: 42,
    createdAt: '09:42',
    detections: { critical: 7, high: 18, medium: 42, low: 31 },
  },
  {
    id: 'batch-47cd20e2',
    parkId: 'RJ_BLOCK_C',
    fileName: 'rj_block_c_thermal_rgb.zip',
    status: 'completed',
    progress: 1,
    processed: 1180,
    total: 1180,
    altitude: 38,
    createdAt: '08:18',
    detections: { critical: 2, high: 11, medium: 29, low: 16 },
  },
]

export default function PlatformPage() {
  return (
    <ToastProvider>
      <PlatformPageBody />
    </ToastProvider>
  )
}

function PlatformPageBody() {
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const offlineToastedRef = useRef(false)
  const [jobs, setJobs] = useState<BatchJob[]>(demoJobs)
  const [activeJobId, setActiveJobId] = useState(demoJobs[0].id)
  const [parkId, setParkId] = useState('MH_SOLAR_07')
  const [altitude, setAltitude] = useState(42)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const [message, setMessage] = useState('Ready')
  const [query, setQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('markers')
  const [basemap, setBasemap] = useState<BasemapId>(
    (process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? 'mapbox' : 'esri') as BasemapId,
  )
  const [orthos, setOrthos] = useState<OrthoMeta[]>([])
  const [activeOrtho, setActiveOrtho] = useState<OrthoMeta | null>(null)
  const [orthoUploading, setOrthoUploading] = useState(false)
  const orthoInput = useRef<HTMLInputElement>(null)

  // ── tabbed nav ──
  const [tab, setTab] = useState<Tab>('operations')

  // ── inspect tab ──
  const inspectInput = useRef<HTMLInputElement>(null)
  const [inspectFile, setInspectFile] = useState<File | null>(null)
  const [inspectBusy, setInspectBusy] = useState(false)
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null)
  const [inspectError, setInspectError] = useState<string | null>(null)

  // ── history tab ──
  const [parkList, setParkList] = useState<Array<{ id: string; name?: string }>>([])
  const [historyParkId, setHistoryParkId] = useState<string>('')
  const [parkSummary, setParkSummary] = useState<ParkSummary | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── settings tab ──
  const [settings, setSettings] = useState<SettingsBlob | null>(null)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<string>('')

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) || jobs[0],
    [activeJobId, jobs],
  )

  const { data: mapData, loading: mapLoading } = useMapData(
    API_BASE,
    activeJob.id,
    activeJob.status,
  )

  const liveFindings: Finding[] = useMemo(
    () => (mapData ? mapData.anomalies.map(findingFromAnomaly) : []),
    [mapData],
  )

  const totals = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        acc.running += job.status === 'processing' ? 1 : 0
        acc.completed += job.status === 'completed' ? 1 : 0
        acc.critical += job.detections.critical
        acc.images += job.total || job.processed
        return acc
      },
      { running: 0, completed: 0, critical: 0, images: 0 },
    )
  }, [jobs])

  const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const visibleFindings = useMemo(() => {
    const q = query.toLowerCase()
    return liveFindings
      .filter((finding) => {
        const matchesSeverity = severityFilter === 'all' || severityFilter === finding.severity
        const haystack = `${finding.id} ${finding.module} ${finding.className}`.toLowerCase()
        return matchesSeverity && haystack.includes(q)
      })
      .sort((a, b) => {
        const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        return rank !== 0 ? rank : b.confidence - a.confidence
      })
      .slice(0, 50)
  }, [query, severityFilter, liveFindings])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.health()
        if (!cancelled) {
          setHealth(data as Health)
          setMessage(`API online: ${(data as Health).model}`)
          offlineToastedRef.current = false
        }
      } catch (err) {
        if (!cancelled) {
          if (!offlineToastedRef.current) {
            toast.error(err instanceof ApiError ? err.message : `API offline at ${API_BASE}`)
            offlineToastedRef.current = true
          }
          setMessage(`API offline at ${API_BASE}`)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const liveJobs = jobs.filter(
      (job) =>
        (job.status === 'queued' || job.status === 'processing') &&
        !demoJobs.some((demo) => demo.id === job.id),
    )
    if (!liveJobs.length) return

    const timer = window.setInterval(async () => {
      const updates = await Promise.all(
        liveJobs.map(async (job) => {
          try {
            const data = await api.status(job.id)
            return { id: job.id, data }
          } catch (err) {
            // Suppress per-poll toasts to avoid spamming; errors are transient network blips
            console.warn('status poll failed for', job.id, err)
            return null
          }
        }),
      )

      setJobs((current) =>
        current.map((job) => {
          const update = updates.find((item) => item?.id === job.id)
          if (!update) return job
          return {
            ...job,
            status: (update.data.state ?? update.data.status) as JobStatus,
            progress: Number(update.data.progress || 0),
            processed: Number(update.data.processed || 0),
            total: Number(update.data.total || job.total),
            error: update.data.message,
          }
        }),
      )
    }, 1800)

    return () => window.clearInterval(timer)
  }, [jobs])

  useEffect(() => {
    let cancelled = false
    setActiveOrtho(null)
    ;(async () => {
      try {
        const data = await api.orthos(activeJob.parkId)
        if (!cancelled) {
          const raw = data as unknown as { orthos?: OrthoMeta[] } | OrthoMeta[]
          const list = Array.isArray(raw) ? raw : ((raw as { orthos?: OrthoMeta[] }).orthos ?? [])
          setOrthos(list)
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : String(err))
          setOrthos([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeJob.parkId])

  async function uploadOrtho(file: File | undefined) {
    if (!file) return
    if (!/\.(tif|tiff)$/i.test(file.name)) {
      setMessage('Orthomosaic must be a .tif or .tiff GeoTIFF')
      return
    }
    setOrthoUploading(true)
    setMessage(`Uploading ortho ${file.name}…`)
    const form = new FormData()
    form.append('file', file)
    try {
      const data = await api.uploadOrtho(activeJob.parkId, form)
      const ortho = data as unknown as OrthoMeta
      setOrthos((current) => {
        const next = current.filter((o) => o.name !== ortho.name)
        return [...next, ortho]
      })
      setActiveOrtho(ortho)
      setMessage(`Ortho ${ortho.name} ready · ${(ortho as Record<string, unknown>).crs}`)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Ortho upload failed')
      setMessage(msg)
      toast.error(msg)
    } finally {
      setOrthoUploading(false)
    }
  }

  function selectFile(file: File | undefined) {
    if (!file) return
    setSelectedFile(file)
    setMessage(file.name.endsWith('.zip') ? 'Mission package selected' : 'Batch upload expects a .zip archive')
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    selectFile(event.dataTransfer.files[0])
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0])
  }

  async function uploadBatch() {
    if (!selectedFile) {
      setMessage('Choose a mission ZIP first')
      return
    }
    if (!selectedFile.name.endsWith('.zip')) {
      setMessage('Only .zip mission folders can be submitted')
      return
    }

    setIsUploading(true)
    setMessage('Uploading batch...')

    const form = new FormData()
    form.append('images', selectedFile)
    form.append('park_id', parkId)
    form.append('park_mode', 'auto')
    form.append('altitude_m', String(altitude))

    try {
      const data = await api.batch(form)

      const job: BatchJob = {
        id: data.job_id,
        parkId,
        fileName: selectedFile.name,
        status: 'queued',
        progress: 0,
        processed: 0,
        total: 0,
        altitude,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        detections: { critical: 0, high: 0, medium: 0, low: 0 },
      }

      setJobs((current) => [job, ...current])
      setActiveJobId(job.id)
      setSelectedFile(null)
      setMessage(`Queued ${data.job_id}`)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Could not submit batch')
      setMessage(msg)
      toast.error(msg)
    } finally {
      setIsUploading(false)
    }
  }

  function reportHref(format: ReportFormat) {
    return api.reportUrl(activeJob.id, format as 'json' | 'excel' | 'geojson' | 'pdf')
  }

  // ── Inspect (single image) ──
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
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Inspect failed')
      setInspectError(msg)
      toast.error(msg)
    } finally {
      setInspectBusy(false)
    }
  }

  // ── History: load parks + selected park summary ──
  useEffect(() => {
    if (tab !== 'history') return
    ;(async () => {
      try {
        const d = await api.parks()
        const parks = (d as unknown as { parks: Array<{ id: string; name?: string }> }).parks || (d as Array<{ id: string; name?: string }>) || []
        setParkList(parks)
        if (!historyParkId && parks[0]) setHistoryParkId(parks[0].id)
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : String(err))
        setParkList([])
      }
    })()
  }, [tab, historyParkId])

  useEffect(() => {
    if (tab !== 'history' || !historyParkId) return
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
  }, [tab, historyParkId])

  // ── Settings: load on first visit ──
  useEffect(() => {
    if (tab !== 'settings' || settings) return
    setSettingsBusy(true)
    ;(async () => {
      try {
        const d = await api.getSettings()
        const blob = (d as unknown as { settings: SettingsBlob }).settings || (d as SettingsBlob)
        setSettings(blob)
        setSettingsDirty(false)
        setSettingsMsg('Loaded from settings.yaml')
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Settings unavailable')
        setSettingsMsg(msg)
        toast.error(msg)
      } finally {
        setSettingsBusy(false)
      }
    })()
  }, [tab, settings])

  function updateSetting(group: string, key: string, value: unknown) {
    setSettings((s) => {
      if (!s) return s
      return { ...s, [group]: { ...(s[group] || {}), [key]: value } }
    })
    setSettingsDirty(true)
  }

  async function saveSettings() {
    if (!settings) return
    setSettingsBusy(true)
    try {
      await api.putSettings(settings as import('@/lib/api').SettingsBlob)
      setSettingsDirty(false)
      setSettingsMsg('Saved · platform restart may be required for some fields')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : 'Save failed')
      setSettingsMsg(msg)
      toast.error(msg)
    } finally {
      setSettingsBusy(false)
    }
  }

  return (
    <main className="ax-page">
      <style jsx global>{`
        body {
          cursor: auto;
          overflow: hidden;
          background: #f4f5f7;
        }
      `}</style>
      <style jsx>{`
        .ax-page {
          height: 100%;
          min-height: calc(100vh - 48px);
          overflow-y: auto;
          background: #f4f5f7;
          color: #111827;
          font-family:
            Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
            sans-serif;
        }
        .shell {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          min-height: 100%;
        }
        .rail {
          position: sticky;
          top: 0;
          align-self: start;
          height: 100vh;
          border-right: 1px solid #e2e8f0;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          padding: 18px 14px;
          gap: 18px;
        }
        .rail-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 6px;
        }
        .rail-brand strong {
          display: block;
          font-size: 15px;
          letter-spacing: 0;
        }
        .rail-brand span {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
        }
        .rail-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0ea5e9, #7c3aed);
        }
        .rail-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .rail-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 6px;
          border: 0;
          background: transparent;
          color: #475569;
          font: 600 13px/1 Inter, sans-serif;
          text-align: left;
          cursor: pointer;
        }
        .rail-link:hover {
          background: #f1f5f9;
          color: #111827;
        }
        .rail-link.active {
          background: #111827;
          color: #ffffff;
        }
        .rail-foot {
          margin-top: auto;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
          font-size: 11px;
          color: #475569;
        }
        .rail-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
        }
        .rail-status span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .rail-status.ok span {
          background: #16a34a;
        }
        .rail-status.down span {
          background: #dc2626;
        }
        .rail-foot-line {
          margin-top: 6px;
          color: #64748b;
          font-weight: 500;
        }
        .tab-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        /* ─── Command bar (compact header) ─── */
        .cmdbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: end;
          padding: 6px 0 0;
        }
        .cmdbar h1 {
          margin: 4px 0 0;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .cmdbar .eyebrow {
          font-size: 11px;
        }
        .chips {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 32px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          font: 700 12px/1 Inter, sans-serif;
        }
        .chip-label {
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .chip-value {
          color: #111827;
          font-size: 14px;
          font-weight: 800;
        }
        .chip-info {
          border-color: #bfdbfe;
          background: #eff6ff;
        }
        .chip-info .chip-value {
          color: #1d4ed8;
        }
        .chip-ok {
          border-color: #bbf7d0;
          background: #f0fdf4;
        }
        .chip-ok .chip-value {
          color: #166534;
        }
        .chip-crit {
          border-color: #fecaca;
          background: #fef2f2;
        }
        .chip-crit .chip-value {
          color: #991b1b;
        }
        .chip-muted {
          background: #f8fafc;
        }

        /* ─── Operations dashboard grid ─── */
        .ops-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 14px;
          align-items: start;
        }
        .ops-main {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
        }
        .ops-rail {
          display: flex;
          flex-direction: column;
          gap: 14px;
          position: sticky;
          top: 14px;
          align-self: start;
          max-height: calc(100vh - 28px);
          overflow-y: auto;
          padding-right: 2px;
        }
        .ops-rail::-webkit-scrollbar {
          width: 6px;
        }
        .ops-rail::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }

        /* ─── Compact panel head variant ─── */
        .panel-head.compact {
          margin-bottom: 10px;
          gap: 10px;
        }
        .panel-head.compact .panel-title {
          font-size: 14px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .panel-head.compact p {
          margin: 2px 0 0;
          font-size: 12px;
        }
        .panel-head.compact .secondary {
          height: 30px;
          padding: 0 10px;
          font-size: 12px;
        }

        /* ─── Map hero ─── */
        .map-panel-hero {
          padding: 12px;
        }

        /* ─── Findings grid (denser) ─── */
        .findings-grid {
          display: grid;
          gap: 6px;
          max-height: 380px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .findings-grid::-webkit-scrollbar {
          width: 6px;
        }
        .findings-grid::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .findings-grid .finding {
          grid-template-columns: 140px minmax(0, 1fr);
          margin-top: 0;
          padding: 8px 10px;
          gap: 10px;
        }
        .findings-grid .finding-id strong {
          display: block;
          font-size: 13px;
        }
        .findings-grid .finding-id .muted {
          font-size: 10px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .findings-grid .finding-body {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .findings-grid .finding-body p {
          margin: 0;
          font-size: 12px;
          line-height: 1.45;
        }

        .tools.inline {
          margin-bottom: 0;
          gap: 8px;
        }
        .tools.inline .search input,
        .tools.inline select {
          height: 32px;
        }
        .tools.inline .search {
          min-width: 160px;
        }

        /* ─── Active job card (accent) ─── */
        .job-card {
          padding: 14px;
          border: 1px solid #e2e8f0;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        }
        .job-card.processing {
          border-color: #bfdbfe;
        }
        .job-card.completed {
          border-color: #bbf7d0;
        }
        .job-card.failed {
          border-color: #fecaca;
        }
        .job-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }
        .job-head .micro {
          display: block;
          font-size: 10px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .job-head strong {
          display: block;
          font-size: 17px;
          font-weight: 800;
          margin-top: 2px;
        }
        .job-progress {
          margin-top: 12px;
        }
        .job-progress-row {
          display: flex;
          justify-content: space-between;
          font: 700 12px/1 Inter, sans-serif;
          margin-bottom: 4px;
        }
        .bar.slim {
          height: 4px;
        }
        .mini-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 8px;
          margin-top: 12px;
        }
        .mini-row .mini {
          padding: 8px;
        }
        .mini-row .mini span {
          font-size: 10px;
        }
        .mini-row .mini strong {
          font-size: 13px;
          margin-top: 2px;
        }
        .job-card .reports {
          margin-top: 12px;
        }
        .job-card .report {
          height: 34px;
          font-size: 12px;
        }

        /* ─── Drop & form compact ─── */
        .drop.compact {
          min-height: 88px;
          padding: 8px;
        }
        .drop.compact strong {
          font-size: 12px;
          margin-top: 4px;
        }
        .drop.compact .muted {
          font-size: 10px;
        }
        .ops-rail .form-row {
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 8px;
        }
        .ops-rail .form-row input {
          height: 32px;
        }
        .ops-rail .primary {
          height: 36px;
          margin-top: 10px;
          font-size: 13px;
        }

        /* ─── Queue (compact list of mini cards) ─── */
        .queue-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 320px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .queue-item {
          display: block;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #ffffff;
          padding: 8px 10px;
          text-align: left;
          cursor: pointer;
          transition: border-color 120ms ease, background 120ms ease;
        }
        .queue-item:hover {
          background: #f8fafc;
        }
        .queue-item.active {
          border-color: #0f172a;
          background: #f1f5f9;
          box-shadow: 0 0 0 1px #0f172a inset;
        }
        .queue-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .queue-row.sub {
          margin-top: 2px;
          font-size: 11px;
        }
        .queue-item strong {
          font-size: 13px;
          font-weight: 700;
        }

        @media (max-width: 1100px) {
          .ops-grid {
            grid-template-columns: 1fr;
          }
          .ops-rail {
            position: relative;
            top: 0;
            max-height: none;
            overflow: visible;
          }
        }

        .inspect-preview-wrap {
          position: relative;
          width: 100%;
          margin-bottom: 14px;
        }
        .inspect-preview {
          display: block;
          width: 100%;
          max-height: 480px;
          object-fit: contain;
          background: #0f172a;
          border-radius: 8px;
        }
        .bbox {
          position: absolute;
          border: 2px solid #0ea5e9;
          border-radius: 2px;
          pointer-events: none;
        }
        .bbox span {
          position: absolute;
          top: -16px;
          left: 0;
          padding: 1px 4px;
          font: 700 9px/1.4 Inter, sans-serif;
          color: #fff;
          white-space: nowrap;
          border-radius: 2px 2px 0 0;
        }
        .insp-head,
        .insp-row {
          display: grid;
          grid-template-columns: 1.5fr 1fr 0.6fr;
          gap: 12px;
          align-items: center;
          padding: 10px 12px;
          border-top: 1px solid #e2e8f0;
        }
        .insp-row:first-child,
        .insp-head {
          border-top: 0;
        }
        .insp-head {
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .hist-head,
        .hist-row {
          display: grid;
          grid-template-columns: 1.6fr 0.6fr 0.7fr 0.6fr 0.6fr;
          gap: 12px;
          align-items: center;
          padding: 10px 12px;
          border-top: 1px solid #e2e8f0;
          font-size: 13px;
        }
        .hist-head {
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .chart-card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 14px;
          background: #ffffff;
        }
        .chart-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          font-size: 13px;
        }
        .chart-head .dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 4px;
          vertical-align: middle;
        }
        .chart-svg {
          height: 160px;
        }
        .settings-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .settings-fields {
          display: grid;
          gap: 10px;
        }
        .setting-row {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          gap: 10px;
          align-items: center;
        }
        .setting-row.wide {
          grid-template-columns: 1fr;
          gap: 4px;
        }
        .setting-row.toggle {
          grid-template-columns: 220px auto;
        }
        .setting-row > span {
          color: #475569;
          font-size: 12px;
          font-weight: 700;
        }
        .setting-row input[type='text'],
        .setting-row input[type='number'],
        .setting-row textarea {
          width: 100%;
          height: 34px;
          padding: 0 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font: inherit;
          background: #ffffff;
        }
        .setting-row textarea {
          height: auto;
          padding: 8px 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
        }
        .settings-actions {
          grid-column: 1 / -1;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          position: sticky;
          bottom: 0;
          background: linear-gradient(180deg, rgba(244, 245, 247, 0) 0%, #f4f5f7 30%);
          padding: 14px 0 4px;
          margin-top: -14px;
          z-index: 5;
        }
        .settings-actions .primary {
          width: 220px;
          margin-top: 0;
        }
        .settings-actions .save-msg {
          align-self: center;
          color: #475569;
          font-size: 12px;
        }
        .note.error {
          border-color: #fecaca;
          background: #fef2f2;
          color: #991b1b;
        }
        @media (max-width: 900px) {
          .shell {
            grid-template-columns: 1fr;
          }
          .rail {
            position: relative;
            height: auto;
            flex-direction: row;
            overflow-x: auto;
            gap: 8px;
          }
          .rail-nav {
            flex-direction: row;
            flex: 1;
          }
          .rail-foot {
            display: none;
          }
          .settings-grid {
            grid-template-columns: 1fr;
          }
        }
        .wrap {
          width: min(1440px, 100%);
          margin: 0 auto;
          padding: 24px;
        }
        .top {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        h1 {
          margin: 6px 0 0;
          font-size: 34px;
          line-height: 1.05;
          letter-spacing: 0;
        }
        p {
          margin: 8px 0 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.6;
        }
        .status-box {
          min-width: 260px;
          border: 1px solid #d6dbe3;
          border-radius: 8px;
          background: #ffffff;
          padding: 12px;
          font-size: 13px;
          color: #334155;
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .metric,
        .panel {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .panel:hover {
          border-color: #d6dbe3;
        }
        .metric {
          padding: 16px;
        }
        .metric-label {
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .metric-value {
          margin-top: 8px;
          font-size: 30px;
          font-weight: 800;
        }
        .grid {
          display: grid;
          grid-template-columns: 390px minmax(0, 1fr);
          gap: 18px;
          margin-bottom: 18px;
        }
        .grid-bottom {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 390px;
          gap: 18px;
        }
        .map-panel {
          margin-bottom: 18px;
        }
        .map-panel .map-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #0f172a;
          color: #f8fafc;
        }
        .map-actions {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .panel {
          padding: 16px;
        }
        .panel-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .panel-title {
          font-size: 18px;
          font-weight: 800;
        }
        .drop {
          display: grid;
          place-items: center;
          min-height: 150px;
          border: 1px dashed #94a3b8;
          border-radius: 8px;
          background: #f8fafc;
          text-align: center;
          cursor: pointer;
        }
        .drop strong {
          display: block;
          margin-top: 8px;
        }
        .muted {
          color: #64748b;
          font-size: 12px;
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        label {
          display: grid;
          gap: 6px;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
        }
        input,
        select {
          height: 40px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          color: #111827;
          padding: 0 10px;
          font: inherit;
          outline: none;
        }
        input:focus,
        select:focus {
          border-color: #111827;
        }
        .primary,
        .secondary,
        .report,
        .row-button,
        .review {
          border-radius: 6px;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }
        .primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          height: 42px;
          margin-top: 12px;
          border: 1px solid #111827;
          background: #111827;
          color: #ffffff;
        }
        .primary:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #111827;
          padding: 9px 12px;
        }
        .note {
          margin-top: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #f8fafc;
          padding: 10px;
          color: #475569;
          font-size: 12px;
          line-height: 1.5;
        }
        .table {
          overflow: hidden;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .table-head,
        .row-button {
          display: grid;
          grid-template-columns: 1.35fr 0.8fr 0.65fr 0.8fr 28px;
          gap: 12px;
          align-items: center;
        }
        .table-head {
          background: #f8fafc;
          padding: 10px 12px;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .row-button {
          width: 100%;
          border: 0;
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
          padding: 12px;
          text-align: left;
        }
        .row-button:hover,
        .row-button.active {
          background: #f1f5f9;
        }
        .mission {
          min-width: 0;
        }
        .mission strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bar {
          height: 7px;
          overflow: hidden;
          border-radius: 999px;
          background: #e2e8f0;
        }
        .bar span {
          display: block;
          height: 100%;
          background: #111827;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          width: fit-content;
          border-radius: 999px;
          padding: 5px 9px;
          font-size: 12px;
          font-weight: 800;
        }
        .queued {
          background: #eef2f7;
          color: #475569;
        }
        .processing {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .completed {
          background: #dcfce7;
          color: #166534;
        }
        .failed {
          background: #fee2e2;
          color: #991b1b;
        }
        .tools {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .search {
          position: relative;
          flex: 1;
          min-width: 220px;
        }
        .search svg {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }
        .search input {
          width: 100%;
          padding-left: 34px;
        }
        .finding {
          display: grid;
          grid-template-columns: 120px minmax(0, 1fr) 96px;
          gap: 12px;
          align-items: center;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px;
          margin-top: 10px;
          cursor: pointer;
          transition: border-color 120ms ease, background 120ms ease;
        }
        .finding:hover {
          background: #f8fafc;
        }
        .finding.selected {
          border-color: #0f172a;
          background: #f1f5f9;
          box-shadow: 0 0 0 1px #0f172a inset;
        }
        .empty {
          padding: 14px;
          color: #64748b;
          font-size: 13px;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          background: #f8fafc;
          text-align: center;
          margin-top: 10px;
        }
        .severity {
          display: inline-flex;
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .critical {
          background: #fee2e2;
          color: #991b1b;
        }
        .high {
          background: #ffedd5;
          color: #9a3412;
        }
        .medium {
          background: #fef3c7;
          color: #92400e;
        }
        .low {
          background: #e0f2fe;
          color: #075985;
        }
        .review {
          height: 36px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #111827;
        }
        .side-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin: 12px 0;
        }
        .mini {
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 10px;
        }
        .mini span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }
        .mini strong {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .reports {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        .report {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 40px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #111827;
          text-decoration: none;
        }
        .report.disabled {
          color: #94a3b8;
          cursor: not-allowed;
        }
        @media (max-width: 1100px) {
          .metrics,
          .grid,
          .grid-bottom {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .wrap {
            padding: 14px;
          }
          .top,
          .form-row,
          .finding,
          .table-head,
          .row-button {
            grid-template-columns: 1fr;
          }
          .top {
            display: grid;
          }
          .metrics {
            grid-template-columns: 1fr 1fr;
          }
          h1 {
            font-size: 28px;
          }
        }
      `}</style>

      <div className="shell">
        <aside className="rail">
          <div className="rail-brand">
            <span className="rail-dot" />
            <div>
              <strong>Axalon</strong>
              <span>Inspection Platform</span>
            </div>
          </div>
          <nav className="rail-nav">
            <button
              type="button"
              className={`rail-link ${tab === 'operations' ? 'active' : ''}`}
              onClick={() => setTab('operations')}
            >
              <LayoutDashboard size={16} />
              <span>Operations</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'inspect' ? 'active' : ''}`}
              onClick={() => setTab('inspect')}
            >
              <ImageIcon size={16} />
              <span>Inspect</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'history' ? 'active' : ''}`}
              onClick={() => setTab('history')}
            >
              <HistoryIcon size={16} />
              <span>History</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => setTab('settings')}
            >
              <SlidersHorizontal size={16} />
              <span>Settings</span>
            </button>
          </nav>
          <div className="rail-foot">
            <div className={`rail-status ${health ? 'ok' : 'down'}`}>
              <span />
              {health ? `API ok · ${health.parks_in_db} parks` : 'API offline'}
            </div>
            <div className="rail-foot-line">{health?.model ?? 'YOLOv8s'}</div>
          </div>
        </aside>

        <div className="wrap">
        {tab === 'operations' && (<>
        {/* Compact command bar — title + inline metric chips */}
        <header className="cmdbar">
          <div className="cmdbar-titles">
            <div className="eyebrow">
              <Wifi size={13} />
              {health ? `${health.status} · DB ${health.db} · ${health.parks_in_db} parks` : message}
            </div>
            <h1>Operations</h1>
          </div>
          <div className="chips">
            <Chip label="Running" value={String(totals.running)} tone="info" />
            <Chip label="Completed" value={String(totals.completed)} tone="ok" />
            <Chip label="Critical" value={String(totals.critical)} tone="crit" />
            <Chip label="Images" value={totals.images.toLocaleString()} tone="muted" />
          </div>
        </header>

        <div className="ops-grid">
          {/* ───── LEFT (primary): map + findings ───── */}
          <div className="ops-main">
            <section className="panel map-panel-hero">
              <div className="panel-head compact">
                <div>
                  <div className="panel-title">
                    <MapIcon size={16} />
                    <span>Anomaly map · {activeJob.parkId}</span>
                  </div>
                  <p>GPS-tagged anomaly markers on every image position.</p>
                </div>
                <div className="map-actions">
                  <input
                    ref={orthoInput}
                    type="file"
                    accept=".tif,.tiff,image/tiff"
                    hidden
                    onChange={(event) => uploadOrtho(event.target.files?.[0])}
                  />
                  <button
                    className="secondary"
                    type="button"
                    disabled={orthoUploading}
                    onClick={() => orthoInput.current?.click()}
                  >
                    <UploadCloud size={14} />
                    {orthoUploading ? 'Uploading…' : 'Upload ortho'}
                  </button>
                </div>
              </div>
              {mapData && (
                <AnomalyMap
                  apiBase={API_BASE}
                  data={mapData}
                  loading={mapLoading}
                  selectedAnomalyId={selectedAnomalyId}
                  onAnomalySelect={setSelectedAnomalyId}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  basemap={basemap}
                  onBasemapChange={setBasemap}
                  ortho={activeOrtho}
                  orthos={orthos}
                  onOrthoChange={setActiveOrtho}
                />
              )}
            </section>

            <section className="panel">
              <div className="panel-head compact">
                <div>
                  <div className="panel-title">Fault triage</div>
                  <p>{visibleFindings.length} of {liveFindings.length} anomalies · click to locate on map.</p>
                </div>
                <div className="tools inline">
                  <label className="search">
                    <Search size={14} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search module or class" />
                  </label>
                  <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as Severity | 'all')}>
                    <option value="all">All severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {!mapLoading && visibleFindings.length === 0 && (
                <div className="empty">
                  No anomalies match the current filters{query ? ' or query' : ''}.
                </div>
              )}
              <div className="findings-grid">
                {visibleFindings.map((finding) => {
                  const selected = selectedAnomalyId === finding.id
                  return (
                    <article
                      className={`finding ${selected ? 'selected' : ''}`}
                      key={finding.id}
                      onClick={() => setSelectedAnomalyId(selected ? null : finding.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedAnomalyId(selected ? null : finding.id)
                        }
                      }}
                    >
                      <div className="finding-id">
                        <span className="muted">{finding.id}</span>
                        <strong>{finding.module}</strong>
                      </div>
                      <div className="finding-body">
                        <span className={`severity ${finding.severity}`}>{finding.severity}</span>
                        <p>
                          <strong>{finding.className}</strong> · {Math.round(finding.confidence * 100)}%
                          <br />
                          <span className="muted">{finding.action}</span>
                        </p>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          </div>

          {/* ───── RIGHT (rail): active job + new mission + queue ───── */}
          <aside className="ops-rail">
            <section className={`panel job-card ${activeJob.status}`}>
              <div className="job-head">
                <div>
                  <div className="muted micro">Active mission</div>
                  <strong>{activeJob.parkId}</strong>
                  <span className="muted micro">{activeJob.id}</span>
                </div>
                <StatusPill status={activeJob.status} />
              </div>
              <div className="job-progress">
                <div className="job-progress-row">
                  <span>{Math.round(activeJob.progress * 100)}%</span>
                  <span className="muted">{activeJob.processed}/{activeJob.total || '—'}</span>
                </div>
                <div className="bar">
                  <span style={{ width: `${activeJob.progress * 100}%` }} />
                </div>
              </div>
              <div className="mini-row">
                <Mini label="Altitude" value={`${activeJob.altitude} m`} />
                <Mini label="Critical" value={String(activeJob.detections.critical)} />
                <Mini label="Started" value={activeJob.createdAt} />
              </div>
              <div className="reports">
                <ReportLink href={reportHref('pdf')} label="PDF" icon="pdf" disabled={activeJob.status !== 'completed'} />
                <ReportLink href={reportHref('excel')} label="Excel" icon="excel" disabled={activeJob.status !== 'completed'} />
                <ReportLink href={reportHref('json')} label="JSON" icon="json" disabled={activeJob.status !== 'completed'} />
                <ReportLink href={reportHref('geojson')} label="GeoJSON" icon="geojson" disabled={activeJob.status !== 'completed'} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-head compact">
                <div>
                  <div className="panel-title">New mission</div>
                  <p>Upload ZIP with thermal/ folder.</p>
                </div>
                <UploadCloud size={18} />
              </div>
              <div
                className="drop compact"
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInput.current?.click()}
              >
                <input ref={fileInput} type="file" accept=".zip" hidden onChange={onFileChange} />
                <div>
                  <UploadCloud size={22} />
                  <strong>{selectedFile ? selectedFile.name : 'Drop ZIP or click'}</strong>
                  <span className="muted">2 GB / 10k files</span>
                </div>
              </div>
              <div className="form-row">
                <label>
                  Park ID
                  <input value={parkId} onChange={(event) => setParkId(event.target.value)} />
                </label>
                <label>
                  Altitude m
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={altitude}
                    onChange={(event) => setAltitude(Number(event.target.value))}
                  />
                </label>
              </div>
              <button className="primary" disabled={isUploading} onClick={uploadBatch}>
                {isUploading ? <RefreshCw size={15} /> : <Play size={15} />}
                Submit batch
              </button>
            </section>

            <section className="panel">
              <div className="panel-head compact">
                <div>
                  <div className="panel-title">Queue</div>
                  <p>{jobs.length} batch{jobs.length === 1 ? '' : 'es'}</p>
                </div>
                <button className="secondary" onClick={() => window.location.reload()}>
                  <RefreshCw size={13} />
                </button>
              </div>
              <div className="queue-list">
                {jobs.map((job) => (
                  <button
                    key={job.id}
                    className={`queue-item ${activeJob.id === job.id ? 'active' : ''}`}
                    onClick={() => setActiveJobId(job.id)}
                  >
                    <div className="queue-row">
                      <strong>{job.parkId}</strong>
                      <StatusPill status={job.status} />
                    </div>
                    <div className="queue-row sub">
                      <span className="muted">{Math.round(job.progress * 100)}%</span>
                      <span className="muted">{job.detections.critical} crit</span>
                    </div>
                    <div className="bar slim">
                      <span style={{ width: `${job.progress * 100}%` }} />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
        </>)}

        {tab === 'inspect' && (
          <section className="tab-section">
            <header className="cmdbar">
              <div className="cmdbar-titles">
                <div className="eyebrow"><ImageIcon size={13} />Single image debug</div>
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
                    0
                  )}
                  tone="crit"
                />
                <Chip
                  label="High"
                  value={String(
                    inspectResult?.summary?.by_severity?.HIGH ??
                    inspectResult?.summary?.HIGH ??
                    inspectResult?.summary?.high ??
                    0
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
                <button className="primary" disabled={!inspectFile || inspectBusy} onClick={runInspect}>
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
                        <span><strong>{d.class}</strong></span>
                        <span><span className={`severity ${d.severity.toLowerCase()}`}>{d.severity}</span></span>
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
        )}

        {tab === 'history' && (
          <section className="tab-section">
            <header className="cmdbar">
              <div className="cmdbar-titles">
                <div className="eyebrow"><HistoryIcon size={13} />Inspection history</div>
                <h1>History</h1>
              </div>
              <div className="chips">
                <Chip label="Parks" value={String(parkList.length)} tone="muted" />
                <Chip label="Flights" value={String(parkSummary?.total_inspections ?? 0)} tone="info" />
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
                  {parkList.length === 0 && <option value="">No parks</option>}
                  {parkList.map((p) => (
                    <option key={p.id} value={p.id}>{p.name ? `${p.id} — ${p.name}` : p.id}</option>
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
                        Number(summary[key] ?? summary[key.toUpperCase()] ?? summary[key.toLowerCase()] ?? 0)
                      return (
                        <div className="hist-row" key={ins.id}>
                          <span>{ins.flight_date ? new Date(ins.flight_date).toLocaleString() : `#${ins.id}`}</span>
                          <span>{ins.total_images ?? '—'}</span>
                          <span>{ins.total_detections ?? 0}</span>
                          <span><strong style={{ color: '#991b1b' }}>{sevCount('CRITICAL')}</strong></span>
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
        )}

        {tab === 'settings' && (
          <section className="tab-section">
            <header className="cmdbar">
              <div className="cmdbar-titles">
                <div className="eyebrow"><SlidersHorizontal size={13} />platform/config/settings.yaml</div>
                <h1>Settings</h1>
              </div>
              <div className="chips">
                <Chip
                  label="Status"
                  value={settingsDirty ? 'Unsaved' : 'In sync'}
                  tone={settingsDirty ? 'crit' : 'ok'}
                />
                <Chip
                  label="Groups"
                  value={String(settings ? Object.keys(settings).length : 0)}
                  tone="muted"
                />
              </div>
            </header>

            {settingsBusy && !settings && <div className="empty">Loading settings…</div>}
            {settings && (
              <div className="settings-grid">
                {Object.entries(settings).map(([group, entries]) => (
                  <section className="panel" key={group}>
                    <div className="panel-head">
                      <div>
                        <div className="panel-title">{group}</div>
                        <p>{Object.keys(entries || {}).length} field(s)</p>
                      </div>
                    </div>
                    <div className="settings-fields">
                      {Object.entries(entries || {}).map(([key, value]) => (
                        <SettingField
                          key={key}
                          group={group}
                          fieldKey={key}
                          value={value}
                          onChange={updateSetting}
                        />
                      ))}
                    </div>
                  </section>
                ))}

                <div className="settings-actions">
                  <span className="save-msg">{settingsMsg}</span>
                  <button
                    type="button"
                    className="primary"
                    disabled={!settingsDirty || settingsBusy}
                    onClick={saveSettings}
                  >
                    {settingsBusy ? <RefreshCw size={17} /> : <Save size={17} />}
                    Save changes
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
        </div>
      </div>
    </main>
  )
}

function InspectPreview({ file, detections }: { file: File; detections: InspectDetection[] }) {
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

function HistoryChart({ inspections }: { inspections: InspectionRow[] }) {
  if (!inspections.length) return null
  const points = [...inspections].reverse() // chronological
  const w = 720
  const h = 160
  const pad = 24
  const totalOf = (p: InspectionRow) => p.total_detections ?? 0
  const critOf = (p: InspectionRow) => Number(p.summary?.CRITICAL ?? p.summary?.critical ?? 0)
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
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="chart-svg">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e2e8f0" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="#e2e8f0" />
        <path d={linePath} fill="none" stroke="#111827" strokeWidth={2} />
        <path d={critPath} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" />
        {points.map((p, i) => (
          <circle key={i} cx={px(i)} cy={py(totalOf(p))} r={3} fill="#111827" />
        ))}
        <text x={pad} y={pad - 6} fontSize="10" fill="#64748b">{max}</text>
        <text x={pad} y={h - pad + 14} fontSize="10" fill="#64748b">0</text>
      </svg>
    </div>
  )
}

function SettingField({
  group,
  fieldKey,
  value,
  onChange,
}: {
  group: string
  fieldKey: string
  value: unknown
  onChange: (group: string, key: string, value: unknown) => void
}) {
  // Nested dicts (rare, e.g. severity_colors) — render as read-only JSON, simplest path
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <label className="setting-row wide">
        <span>{fieldKey}</span>
        <textarea
          rows={3}
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              onChange(group, fieldKey, JSON.parse(e.target.value))
            } catch {
              /* keep raw value as text on bad JSON */
            }
          }}
        />
      </label>
    )
  }
  if (typeof value === 'boolean') {
    return (
      <label className="setting-row toggle">
        <span>{fieldKey}</span>
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(group, fieldKey, e.target.checked)}
        />
      </label>
    )
  }
  if (typeof value === 'number') {
    return (
      <label className="setting-row">
        <span>{fieldKey}</span>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(group, fieldKey, Number(e.target.value))}
        />
      </label>
    )
  }
  if (Array.isArray(value)) {
    return (
      <label className="setting-row wide">
        <span>{fieldKey}</span>
        <input
          type="text"
          value={value.join(', ')}
          onChange={(e) =>
            onChange(
              group,
              fieldKey,
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => (Number.isFinite(Number(s)) ? Number(s) : s)),
            )
          }
        />
      </label>
    )
  }
  return (
    <label className="setting-row">
      <span>{fieldKey}</span>
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onChange(group, fieldKey, e.target.value)}
      />
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  )
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

function StatusPill({ status }: { status: JobStatus }) {
  const Icon =
    status === 'completed' ? CheckCircle2 : status === 'failed' ? XCircle : status === 'processing' ? RefreshCw : Clock3
  return (
    <span className={`pill ${status}`}>
      <Icon size={13} />
      {status}
    </span>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ReportLink({
  href,
  label,
  icon,
  disabled,
}: {
  href: string
  label: string
  icon: ReportFormat
  disabled: boolean
}) {
  const Icon = icon === 'pdf' ? FileText : icon === 'excel' ? FileSpreadsheet : icon === 'json' ? FileJson : MapIcon
  if (disabled) {
    return (
      <span className="report disabled">
        <Icon size={15} />
        {label}
      </span>
    )
  }
  return (
    <a className="report" href={href}>
      <ArrowDownToLine size={15} />
      {label}
    </a>
  )
}

