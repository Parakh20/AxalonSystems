'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FolderKanban, Plus, Trash2 } from 'lucide-react'
import { api, ApiError, type Project, type ProjectDetail } from '@/lib/api'
import { useParks } from '@/components/Platform/hooks/useParks'
import { useToast } from '@/components/Platform/Toast'
import { ErrorBanner } from '@/components/Platform/ErrorBanner'
import { SkeletonLine } from '@/components/Platform/Skeleton'

function errMessage(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : String(err)
}

function ProjectCard({
  project,
  onChanged,
}: {
  project: Project
  onChanged: () => void
}) {
  const toast = useToast()
  const { parks } = useParks()
  const [isOpen, setIsOpen] = useState(false)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [assignParkId, setAssignParkId] = useState('')

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await api.project(project.id))
    } catch (err) {
      toast.error(errMessage(err))
    }
  }, [project.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen) loadDetail()
  }, [isOpen, loadDetail])

  const assignedIds = new Set((detail?.sites ?? []).map((s) => s.id))
  const assignable = parks.filter((p) => !assignedIds.has(p.id))

  async function assign() {
    if (!assignParkId) return
    try {
      await api.updatePark(assignParkId, { project_id: project.id })
      setAssignParkId('')
      loadDetail()
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function unassign(parkId: string) {
    try {
      await api.updatePark(parkId, { project_id: null })
      loadDetail()
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function toggleStatus() {
    try {
      await api.updateProject(project.id, {
        status: project.status === 'active' ? 'archived' : 'active',
      })
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function remove() {
    if (!window.confirm(`Delete project "${project.name}"? Sites stay but become unassigned.`)) return
    try {
      await api.deleteProject(project.id)
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setIsOpen((v) => !v)}>
          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <div>
            <div className="panel-title">{project.name}</div>
            <p>
              {project.client || 'No client'} · {project.site_count ?? 0} site(s)
              {project.description ? ` · ${project.description}` : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" className={`inv-status inv-status-${project.status === 'active' ? 'active' : 'retired'}`} onClick={toggleStatus} title="Toggle status">
            {project.status}
          </button>
          <button type="button" className="inv-icon-btn" onClick={remove} title="Delete project">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isOpen && (
        <div style={{ marginTop: 10 }}>
          {detail === null && <div className="empty">Loading sites…</div>}
          {detail && detail.sites.length === 0 && (
            <div className="inv-bom-empty">No sites assigned yet.</div>
          )}
          {detail && detail.sites.length > 0 && (
            <div className="table">
              <div className="table-head asset-site-head">
                <span>Site</span>
                <span>Panels</span>
                <span>Inspections</span>
                <span>Missions</span>
                <span>Last flight</span>
                <span />
              </div>
              {detail.sites.map((s) => (
                <div className="asset-site-row" key={s.id}>
                  <span className="inv-part">
                    <strong>{s.name}</strong>
                    <small>{s.id}</small>
                  </span>
                  <span>{s.total_panels ?? '—'}</span>
                  <span>{s.inspection_count}</span>
                  <span>{s.mission_count}</span>
                  <span>{s.last_inspection_date ?? '—'}</span>
                  <button type="button" className="inv-icon-btn" onClick={() => unassign(s.id)} title="Remove from project">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {assignable.length > 0 && (
            <div className="inv-assign-form" style={{ marginTop: 8 }}>
              <select value={assignParkId} onChange={(e) => setAssignParkId(e.target.value)}>
                <option value="">Add a site to this project…</option>
                {assignable.map((p) => (
                  <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
                ))}
              </select>
              <button type="button" className="secondary" disabled={!assignParkId} onClick={assign}>
                <Plus size={13} /> Assign
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function AssetsTab() {
  const toast = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [description, setDescription] = useState('')

  const reload = useCallback(async () => {
    setLoadError(null)
    try {
      setProjects(await api.projects())
    } catch (err) {
      const msg = errMessage(err)
      setLoadError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload()
  }, [reload])

  async function create() {
    if (!name.trim()) {
      toast.error('Project name is required')
      return
    }
    try {
      await api.createProject({
        name: name.trim(),
        client: client.trim() || null,
        description: description.trim() || null,
      })
      setName(''); setClient(''); setDescription('')
      reload()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <section className="tab-section">
      <header className="cmdbar">
        <div className="cmdbar-titles">
          <div className="eyebrow">
            <FolderKanban size={13} />
            projects · sites · missions
          </div>
          <h1>Assets</h1>
        </div>
      </header>

      <div className="inv-form">
        <input placeholder="New project name *" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Client" value={client} onChange={(e) => setClient(e.target.value)} />
        <input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="inv-form-actions">
          <button type="button" className="primary" onClick={create}><Plus size={14} /> Create project</button>
        </div>
      </div>

      {loadError && !isLoading && <ErrorBanner message={loadError} onRetry={reload} />}
      {isLoading && (
        <div className="table" style={{ marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <div className="panel" key={i} style={{ marginBottom: 10 }}>
              <SkeletonLine width={200} height={16} />
              <div style={{ marginTop: 8 }}>
                <SkeletonLine width="60%" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!isLoading && !loadError && projects.length === 0 && (
        <div className="empty">No projects yet — group your parks into client projects above.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onChanged={reload} />
        ))}
      </div>
    </section>
  )
}
