export const API_BASE =
  process.env.NEXT_PUBLIC_AXALON_API_URL || 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  body: string
  constructor(status: number, body: string, message?: string) {
    super(message ?? `HTTP ${status}: ${body.slice(0, 200)}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const REQUEST_TIMEOUT_MS = 20_000

function isHtmlBody(text: string): boolean {
  const t = text.trimStart()
  return t.startsWith('<!DOCTYPE') || t.startsWith('<html')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const storedKey =
      typeof sessionStorage !== 'undefined'
        ? (sessionStorage.getItem('axalon_api_key') ?? (process.env.NEXT_PUBLIC_AXALON_API_KEY ?? ''))
        : (process.env.NEXT_PUBLIC_AXALON_API_KEY ?? '')
    const headers: HeadersInit = storedKey
      ? {
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
          Authorization: `Bearer ${storedKey}`,
        }
      : ((init?.headers as Record<string, string> | undefined) ?? {})
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    const msg = isTimeout
      ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s — the backend may be starting up`
      : `Network error contacting ${API_BASE}${path}`
    throw new ApiError(0, String(err), msg)
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('axalon:unauthorized'))
    }
    const body = isHtmlBody(text) ? '' : text
    const msg = isHtmlBody(text)
      ? `Server error (HTTP ${res.status}) — the backend returned an unexpected response`
      : undefined
    throw new ApiError(res.status, body, msg)
  }
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

// Shapes — keep loose; the API is the source of truth.
export type Health = { status: string; [k: string]: unknown }

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type GridPanelDetection = {
  class: string | null
  confidence: number | null
  severity: Severity | null
  thermal_filename: string | null
  bbox: number[] | null
}

export type GridPanel = {
  panel_id: string
  row: number
  col: number
  worst_severity: Severity | null
  detection_count: number
  detections: GridPanelDetection[]
  gps: { lat: number; lon: number } | null
}

export type ParkGrid = {
  park_id: string
  inspection_id: string | null
  rows: number
  cols: number
  panels: GridPanel[]
}

export type TrendPoint = {
  inspection_id: string
  date: string | null
  CRITICAL: number
  HIGH: number
  MEDIUM: number
  LOW: number
}

export type RecurringPanel = {
  panel_id: string
  inspection_count: number
  worst_severity: Severity
  classes: string[]
  first_seen: string | null
  last_seen: string | null
}

export type JobStatus = {
  job_id: string
  state: 'queued' | 'running' | 'succeeded' | 'failed' | string
  progress?: number
  total?: number
  processed?: number
  message?: string
  [k: string]: unknown
}
export type ParkRef = { id: string; name?: string }
export type ParkSummary = Record<string, unknown>
export type MapData = Record<string, unknown>
export type SettingsBlob = Record<string, unknown>
export type InspectResult = {
  job_id: string
  status: string
  total_detections: number
  summary: {
    by_severity?: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number }
    CRITICAL?: number
    HIGH?: number
    MEDIUM?: number
    LOW?: number
    [k: string]: unknown
  }
  detections: Array<{
    class: string
    class_id: number
    confidence: number
    bbox: [number, number, number, number]
    bbox_norm?: [number, number, number, number]
    severity: string
    [k: string]: unknown
  }>
  rgb_filename?: string
  [k: string]: unknown
}
export type OrthoMeta = {
  park_id: string
  name: string
  crs: string
  width: number
  height: number
  band_count: number
  bounds: { west: number; south: number; east: number; north: number }
  center: { lat: number; lon: number }
  size_bytes: number
}

export type DiffPanel = {
  panel_id: string
  status: 'new' | 'resolved' | 'changed' | 'unchanged'
  severity_a: Severity | null
  severity_b: Severity | null
  detections_a: { class: string; severity: Severity | null; confidence: number | null }[]
  detections_b: { class: string; severity: Severity | null; confidence: number | null }[]
}

export type ParkDiff = {
  park_id: string
  inspection_a: string
  inspection_b: string
  summary: { new: number; resolved: number; changed: number }
  panels: DiffPanel[]
}

export type Correction = {
  id: number
  job_id: string
  image_id: string | null
  panel_id: string | null
  class: string
  class_id: number | null
  severity: string | null
  bbox_norm: [number, number, number, number]
  notes: string | null
  created_at: string | null
  updated_at?: string | null
}

export type CorrectionCreate = {
  class_: string
  class_id: number
  severity: string
  bbox_norm: [number, number, number, number]
  image_id?: string
  panel_id?: string
  notes?: string
}

export type MissionSummary = {
  id: number
  name: string
  park_id: string | null
  mission_type: 'grid' | 'perimeter' | 'corridor'
  camera_id: string | null
  area_ha: number | null
  image_count: number | null
  created_at: string | null
}

export type MissionFull = MissionSummary & {
  params: Record<string, unknown>
  polygon: { lat: number; lon: number }[]
  waypoints: { lat: number; lon: number; alt: number }[]
  updated_at: string | null
}

export type MissionCreate = {
  name: string
  park_id?: string | null
  mission_type: string
  camera_id?: string | null
  params: Record<string, unknown>
  polygon: { lat: number; lon: number }[]
  waypoints: { lat: number; lon: number; alt: number }[]
  area_ha: number
  image_count: number
}

// ── Inventory & prototype tracking ───────────────────────────────────────────

export type ComponentCategory =
  | 'flight-controller'
  | 'motor'
  | 'esc'
  | 'battery'
  | 'propeller'
  | 'frame'
  | 'camera'
  | 'sensor'
  | 'companion-computer'
  | 'radio'
  | 'gps'
  | 'wiring'
  | 'other'

export type PrototypeStatus = 'planning' | 'building' | 'active' | 'retired'
export type OrderStatus = 'planned' | 'ordered' | 'received' | 'cancelled'

export type InventoryComponent = {
  id: number
  name: string
  category: ComponentCategory
  part_number: string | null
  vendor: string | null
  link: string | null
  unit_cost: number | null
  currency: string
  qty_total: number
  qty_assigned: number
  qty_available: number
  specs: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type ComponentAssignment = {
  id: number
  component_id: number
  prototype_id: number
  component_name: string | null
  component_category: string | null
  qty: number
  notes: string | null
  created_at: string | null
}

export type Prototype = {
  id: number
  name: string
  status: PrototypeStatus
  description: string | null
  notes: string | null
  assignments: ComponentAssignment[]
  created_at: string | null
  updated_at: string | null
}

export type ComponentOrder = {
  id: number
  component_id: number | null
  name: string
  qty: number
  est_unit_cost: number | null
  vendor: string | null
  link: string | null
  status: OrderStatus
  needed_by: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type InventorySummary = {
  component_count: number
  prototype_count: number
  open_order_count: number
  stock_value: number
  low_stock: InventoryComponent[]
}

export type ComponentCreate = Partial<
  Omit<InventoryComponent, 'id' | 'qty_assigned' | 'qty_available' | 'created_at' | 'updated_at'>
> & { name: string }

export type PrototypeCreate = Partial<Pick<Prototype, 'status' | 'description' | 'notes'>> & {
  name: string
}

export type OrderCreate = Partial<
  Omit<ComponentOrder, 'id' | 'created_at' | 'updated_at'>
>

// ── Area C: Projects → Sites → Missions/Inspections ──────────────────────────

export type ProjectStatus = 'active' | 'archived'

export type Project = {
  id: number
  name: string
  client: string | null
  description: string | null
  status: ProjectStatus
  site_count?: number
  created_at: string | null
  updated_at: string | null
}

export type ProjectSite = {
  id: string
  name: string
  total_panels: number
  inspection_count: number
  mission_count: number
  last_inspection_date: string | null
}

export type ProjectDetail = Project & { sites: ProjectSite[] }

// ── /track workspace ──────────────────────────────────────────────────────────

export type NoteKind = 'research' | 'log' | 'doc' | 'link' | 'idea' | 'other'

export type TrackNote = {
  id: number
  title: string
  kind: NoteKind
  body: string | null
  url: string | null
  tags: string | null
  created_at: string | null
  updated_at: string | null
}

export type TrackFileMeta = {
  id: number
  original_name: string
  stored_name: string
  label: string | null
  content_type: string | null
  size_bytes: number
  created_at: string | null
}

export type NoteCreate = Partial<Omit<TrackNote, 'id' | 'created_at' | 'updated_at'>> & {
  title: string
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export const api = {
  health: () => request<Health>('/health'),
  batch: (form: FormData) =>
    request<{ job_id: string }>('/batch', { method: 'POST', body: form }),
  inspect: (form: FormData) =>
    request<InspectResult>('/inspect', { method: 'POST', body: form }),
  status: (jobId: string) => request<JobStatus>(`/status/${encodeURIComponent(jobId)}`),
  reportUrl: (jobId: string, format: 'json' | 'excel' | 'geojson' | 'pdf') => {
    const storedKey =
      typeof sessionStorage !== 'undefined'
        ? (sessionStorage.getItem('axalon_api_key') ?? (process.env.NEXT_PUBLIC_AXALON_API_KEY ?? ''))
        : (process.env.NEXT_PUBLIC_AXALON_API_KEY ?? '')
    const keyParam = storedKey ? `&api_key=${encodeURIComponent(storedKey)}` : ''
    return `${API_BASE}/report/${encodeURIComponent(jobId)}?format=${format}${keyParam}`
  },
  mapData: (jobId: string) => request<MapData>(`/map/${encodeURIComponent(jobId)}`),
  parks: () => request<ParkRef[]>('/parks'),
  missions: (parkId?: string) =>
    request<MissionSummary[]>(`/missions${parkId ? `?park_id=${encodeURIComponent(parkId)}` : ''}`),
  mission: (id: number) => request<MissionFull>(`/missions/${id}`),
  createMission: (body: MissionCreate) =>
    request<MissionSummary>('/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteMission: (id: number) => request<void>(`/missions/${id}`, { method: 'DELETE' }),
  park: (parkId: string) =>
    request<ParkSummary>(`/park/${encodeURIComponent(parkId)}`),
  parkGrid: (parkId: string, inspectionId?: string) => {
    const q = inspectionId ? `?inspection_id=${encodeURIComponent(inspectionId)}` : ''
    return request<ParkGrid>(`/park/${encodeURIComponent(parkId)}/grid${q}`)
  },
  parkGridPng: (parkId: string, inspectionId?: string) => {
    const q = inspectionId ? `?inspection_id=${encodeURIComponent(inspectionId)}` : ''
    const storedKey =
      typeof sessionStorage !== 'undefined'
        ? (sessionStorage.getItem('axalon_api_key') ?? (process.env.NEXT_PUBLIC_AXALON_API_KEY ?? ''))
        : (process.env.NEXT_PUBLIC_AXALON_API_KEY ?? '')
    return fetch(`${API_BASE}/park/${encodeURIComponent(parkId)}/grid/png${q}`, {
      headers: storedKey ? { Authorization: `Bearer ${storedKey}` } : {},
    }).then((res) => {
      if (!res.ok) throw new Error(`PNG export failed: ${res.status}`)
      return res.blob()
    })
  },
  parkTrend: (parkId: string) =>
    request<TrendPoint[]>(`/park/${encodeURIComponent(parkId)}/trend`),
  parkRecurring: (parkId: string, minInspections = 2) =>
    request<RecurringPanel[]>(
      `/park/${encodeURIComponent(parkId)}/recurring?min_inspections=${minInspections}`,
    ),
  orthos: (parkId: string) =>
    request<OrthoMeta[] | { orthos: OrthoMeta[] }>(
      `/park/${encodeURIComponent(parkId)}/orthos`,
    ).then((resp) => (Array.isArray(resp) ? resp : resp.orthos ?? [])),
  uploadOrtho: (parkId: string, form: FormData) =>
    request<OrthoMeta>(`/park/${encodeURIComponent(parkId)}/ortho`, {
      method: 'POST',
      body: form,
    }),
  getSettings: () => request<SettingsBlob>('/settings'),
  putSettings: (blob: SettingsBlob) =>
    request<SettingsBlob>('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: blob }),
    }),
  parkDiff: (parkId: string, inspectionA: string, inspectionB: string) =>
    request<ParkDiff>(
      `/park/${encodeURIComponent(parkId)}/diff?inspection_a=${encodeURIComponent(inspectionA)}&inspection_b=${encodeURIComponent(inspectionB)}`,
    ),
  corrections: (jobId: string) =>
    request<Correction[]>(`/corrections/${encodeURIComponent(jobId)}`),
  addCorrection: (jobId: string, body: CorrectionCreate) =>
    request<Correction>(`/corrections/${encodeURIComponent(jobId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteCorrection: (jobId: string, id: number) =>
    request<void>(`/corrections/${encodeURIComponent(jobId)}/${id}`, { method: 'DELETE' }),

  projects: () => request<Project[]>('/projects'),
  project: (id: number) => request<ProjectDetail>(`/projects/${id}`),
  createProject: (body: { name: string; client?: string | null; description?: string | null }) =>
    request<Project>('/projects', jsonInit('POST', body)),
  updateProject: (id: number, body: Partial<Pick<Project, 'name' | 'client' | 'description' | 'status'>>) =>
    request<Project>(`/projects/${id}`, jsonInit('PATCH', body)),
  deleteProject: (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  updatePark: (parkId: string, body: { project_id?: number | null; name?: string }) =>
    request<{ id: string; name: string; project_id: number | null }>(
      `/park/${encodeURIComponent(parkId)}`,
      jsonInit('PATCH', body),
    ),

  analyticsOverview: () =>
    request<{ park: ParkRef; trend: TrendPoint[] }[]>('/analytics/overview'),

  // Inventory & prototype tracking
  inventorySummary: () => request<InventorySummary>('/inventory/summary'),
  inventoryComponents: () => request<InventoryComponent[]>('/inventory/components'),
  createComponent: (body: ComponentCreate) =>
    request<InventoryComponent>('/inventory/components', jsonInit('POST', body)),
  updateComponent: (id: number, body: Partial<ComponentCreate>) =>
    request<InventoryComponent>(`/inventory/components/${id}`, jsonInit('PATCH', body)),
  deleteComponent: (id: number) =>
    request<void>(`/inventory/components/${id}`, { method: 'DELETE' }),
  prototypes: () => request<Prototype[]>('/inventory/prototypes'),
  createPrototype: (body: PrototypeCreate) =>
    request<Prototype>('/inventory/prototypes', jsonInit('POST', body)),
  updatePrototype: (id: number, body: Partial<PrototypeCreate>) =>
    request<Prototype>(`/inventory/prototypes/${id}`, jsonInit('PATCH', body)),
  deletePrototype: (id: number) =>
    request<void>(`/inventory/prototypes/${id}`, { method: 'DELETE' }),
  createAssignment: (body: { component_id: number; prototype_id: number; qty: number; notes?: string }) =>
    request<ComponentAssignment>('/inventory/assignments', jsonInit('POST', body)),
  updateAssignment: (id: number, body: { qty?: number; notes?: string }) =>
    request<ComponentAssignment>(`/inventory/assignments/${id}`, jsonInit('PATCH', body)),
  deleteAssignment: (id: number) =>
    request<void>(`/inventory/assignments/${id}`, { method: 'DELETE' }),
  orders: () => request<ComponentOrder[]>('/inventory/orders'),
  createOrder: (body: OrderCreate) =>
    request<ComponentOrder>('/inventory/orders', jsonInit('POST', body)),
  updateOrder: (id: number, body: Partial<OrderCreate>) =>
    request<ComponentOrder>(`/inventory/orders/${id}`, jsonInit('PATCH', body)),
  deleteOrder: (id: number) =>
    request<void>(`/inventory/orders/${id}`, { method: 'DELETE' }),

  // /track workspace
  trackLogin: (password: string) =>
    request<{ ok: boolean }>('/track/login', jsonInit('POST', { password })),
  setTrackPassword: (newPassword: string, currentPassword?: string) =>
    request<{ ok: boolean }>(
      '/track/password',
      jsonInit('POST', { new_password: newPassword, current_password: currentPassword ?? '' }),
    ),
  trackNotes: (kind?: string) =>
    request<TrackNote[]>(`/track/notes${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  createNote: (body: NoteCreate) => request<TrackNote>('/track/notes', jsonInit('POST', body)),
  updateNote: (id: number, body: Partial<NoteCreate>) =>
    request<TrackNote>(`/track/notes/${id}`, jsonInit('PATCH', body)),
  deleteNote: (id: number) => request<void>(`/track/notes/${id}`, { method: 'DELETE' }),
  trackFiles: () => request<TrackFileMeta[]>('/track/files'),
  uploadTrackFile: (form: FormData) =>
    request<TrackFileMeta>('/track/files', { method: 'POST', body: form }),
  deleteTrackFile: (id: number) => request<void>(`/track/files/${id}`, { method: 'DELETE' }),
  trackFileUrl: (id: number) => {
    const storedKey =
      typeof sessionStorage !== 'undefined'
        ? (sessionStorage.getItem('axalon_api_key') ?? (process.env.NEXT_PUBLIC_AXALON_API_KEY ?? ''))
        : (process.env.NEXT_PUBLIC_AXALON_API_KEY ?? '')
    const keyParam = storedKey ? `?api_key=${encodeURIComponent(storedKey)}` : ''
    return `${API_BASE}/track/files/${id}${keyParam}`
  },
}
