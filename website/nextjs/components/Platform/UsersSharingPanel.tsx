'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link2, Trash2, UserPlus, Users } from 'lucide-react'
import {
  api,
  ApiError,
  type AuthUser,
  type Project,
  type ShareLink,
  type UserRole,
} from '@/lib/api'
import { useToast } from '@/components/Platform/Toast'

const ROLES: UserRole[] = ['admin', 'operator', 'viewer']

function errMessage(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const detail = JSON.parse(err.body)?.detail
      if (typeof detail === 'string') return detail
    } catch {
      /* fall through to the generic message */
    }
  }
  return err instanceof Error ? err.message : String(err)
}

function ProjectPicker({
  projects,
  selected,
  onToggle,
  labelPrefix,
}: {
  projects: Project[]
  selected: number[]
  onToggle: (id: number) => void
  labelPrefix: string
}) {
  if (projects.length === 0) return <span className="muted">No projects yet</span>
  return (
    <div className="project-picker">
      {projects.map((p) => (
        <label key={p.id} className="project-chip">
          <input
            type="checkbox"
            aria-label={`${labelPrefix} ${p.name}`}
            checked={selected.includes(p.id)}
            onChange={() => onToggle(p.id)}
          />
          <span>{p.name}</span>
        </label>
      ))}
    </div>
  )
}

function toggled(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].sort((a, b) => a - b)
}

/** Admin-only account and share-link management (AXALON_AUTH_MODE=users). */
export function UsersSharingPanel() {
  const toast = useToast()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])

  const load = useCallback(async () => {
    try {
      const [u, p, l] = await Promise.all([api.users(), api.projects(), api.shareLinks()])
      setUsers(u)
      setProjects(p)
      setLinks(l)
    } catch (err) {
      toast.error(errMessage(err))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  async function patchUser(user: AuthUser, body: Parameters<typeof api.updateUser>[1]) {
    try {
      const updated = await api.updateUser(user.id, body)
      setUsers((all) => all.map((u) => (u.id === updated.id ? updated : u)))
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function removeUser(user: AuthUser) {
    if (!window.confirm(`Delete ${user.email}? Their sessions end immediately.`)) return
    try {
      await api.deleteUser(user.id)
      setUsers((all) => all.filter((u) => u.id !== user.id))
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  const projectName = (id: number) => projects.find((p) => p.id === id)?.name ?? `#${id}`

  return (
    <div className="users-sharing">
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">
              <Users size={16} /> Users
            </div>
            <p>Admins see everything. Operators and viewers only see the projects ticked here.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Projects</th>
                <th>Active</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={user.disabled ? 'is-disabled' : ''}>
                  <td>{user.email}</td>
                  <td>
                    <select
                      aria-label={`Role for ${user.email}`}
                      value={user.role}
                      onChange={(e) => patchUser(user, { role: e.target.value as UserRole })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {user.role === 'admin' ? (
                      <span className="muted">All projects</span>
                    ) : (
                      <ProjectPicker
                        projects={projects}
                        selected={user.project_ids}
                        labelPrefix={`${user.email} access to`}
                        onToggle={(id) => patchUser(user, { project_ids: toggled(user.project_ids, id) })}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${user.email} active`}
                      checked={!user.disabled}
                      onChange={(e) => patchUser(user, { disabled: !e.target.checked })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary icon-only"
                      aria-label={`Delete ${user.email}`}
                      onClick={() => removeUser(user)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddUserForm projects={projects} onAdded={(u) => setUsers((all) => [...all, u])} />
      </section>

      <SharePanel projects={projects} links={links} projectName={projectName} onChanged={load} />
    </div>
  )
}

function AddUserForm({ projects, onAdded }: { projects: Project[]; onAdded: (user: AuthUser) => void }) {
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [projectIds, setProjectIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const created = await api.createUser({ email: email.trim(), password, role, project_ids: projectIds })
      onAdded(created)
      setEmail('')
      setPassword('')
      setProjectIds([])
      toast.success(`Added ${created.email}`)
    } catch (err) {
      toast.error(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add-user-form" onSubmit={submit}>
      <input
        type="email"
        aria-label="New user email"
        placeholder="email@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        aria-label="Initial password"
        placeholder="Initial password (10+ chars)"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <select aria-label="New user role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {role !== 'admin' && (
        <ProjectPicker
          projects={projects}
          selected={projectIds}
          labelPrefix="Grant"
          onToggle={(id) => setProjectIds((ids) => toggled(ids, id))}
        />
      )}
      <button type="submit" className="primary" disabled={busy}>
        <UserPlus size={15} /> Add user
      </button>
    </form>
  )
}

function SharePanel({
  projects,
  links,
  projectName,
  onChanged,
}: {
  projects: Project[]
  links: ShareLink[]
  projectName: (id: number) => string
  onChanged: () => void
}) {
  const toast = useToast()
  const [projectId, setProjectId] = useState('')
  const [label, setLabel] = useState('')
  const [days, setDays] = useState(7)
  const [newUrl, setNewUrl] = useState('')

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!projectId) {
      toast.error('Choose a project to share')
      return
    }
    try {
      const link = await api.createShareLink({
        project_id: Number(projectId),
        label: label.trim() || undefined,
        expires_in_days: days,
      })
      setNewUrl(`${window.location.origin}/platform?share=${encodeURIComponent(link.token)}`)
      setLabel('')
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  async function revoke(link: ShareLink) {
    if (!window.confirm('Revoke this link? Anyone using it loses access immediately.')) return
    try {
      await api.revokeShareLink(link.id)
      onChanged()
    } catch (err) {
      toast.error(errMessage(err))
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title">
            <Link2 size={16} /> Share links
          </div>
          <p>Read-only access to one project, no account needed. Links expire and can be revoked.</p>
        </div>
      </div>
      <form className="add-user-form" onSubmit={create}>
        <select aria-label="Share project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input aria-label="Share label" placeholder="Label (e.g. client name)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <label className="inline-field">
          <span>Days</span>
          <input
            type="number"
            aria-label="Expires in days"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <button type="submit" className="primary">
          Create link
        </button>
      </form>
      {newUrl && (
        <div className="share-url">
          <span>Copy now — this link is not shown again:</span>
          <input aria-label="New share URL" readOnly value={newUrl} onFocus={(e) => e.target.select()} />
        </div>
      )}
      <ul className="share-list">
        {links.map((link) => (
          <li key={link.id} className={link.revoked || link.expired ? 'is-disabled' : ''}>
            <strong>{link.label || 'Untitled link'}</strong>
            <span>{projectName(link.project_id)}</span>
            <span className="muted">
              {link.revoked ? 'revoked' : link.expired ? 'expired' : `expires ${link.expires_at?.slice(0, 10) ?? ''}`}
            </span>
            {!link.revoked && (
              <button
                type="button"
                className="secondary"
                aria-label={`Revoke ${link.label || 'untitled link'}`}
                onClick={() => revoke(link)}
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
