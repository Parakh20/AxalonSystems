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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch (err) {
    throw new ApiError(0, String(err), `Network error contacting ${API_BASE}${path}`)
  }
  const text = await res.text()
  if (!res.ok) throw new ApiError(res.status, text)
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

// Shapes — keep loose; the API is the source of truth.
export type Health = { status: string; [k: string]: unknown }
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
export type InspectResult = Record<string, unknown>
export type OrthoMeta = {
  name: string
  bounds?: [number, number, number, number]
  [k: string]: unknown
}

export const api = {
  health: () => request<Health>('/health'),
  batch: (form: FormData) =>
    request<{ job_id: string }>('/batch', { method: 'POST', body: form }),
  inspect: (form: FormData) =>
    request<InspectResult>('/inspect', { method: 'POST', body: form }),
  status: (jobId: string) => request<JobStatus>(`/status/${encodeURIComponent(jobId)}`),
  reportUrl: (jobId: string, format: 'json' | 'excel' | 'geojson' | 'pdf') =>
    `${API_BASE}/report/${encodeURIComponent(jobId)}?format=${format}`,
  mapData: (jobId: string) => request<MapData>(`/map/${encodeURIComponent(jobId)}`),
  parks: () => request<ParkRef[]>('/parks'),
  park: (parkId: string) =>
    request<ParkSummary>(`/park/${encodeURIComponent(parkId)}`),
  orthos: (parkId: string) =>
    request<OrthoMeta[]>(`/park/${encodeURIComponent(parkId)}/orthos`),
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
      body: JSON.stringify(blob),
    }),
}
