'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, NotebookPen, Plus, Trash2 } from 'lucide-react'
import { api, type NoteKind, type TrackNote } from '@/lib/api'
import { useToast } from '@/components/Platform/Toast'

const KINDS: NoteKind[] = ['research', 'log', 'doc', 'link', 'idea', 'other']

export function TrackNotesPanel() {
  const toast = useToast()
  const [notes, setNotes] = useState<TrackNote[]>([])
  const [filter, setFilter] = useState<string>('')
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<NoteKind>('research')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')

  async function reload(kindFilter = filter) {
    try {
      setNotes(await api.trackNotes(kindFilter || undefined))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    if (!title.trim()) {
      toast.error('Note title is required')
      return
    }
    try {
      await api.createNote({
        title: title.trim(),
        kind,
        body: body.trim() || null,
        url: url.trim() || null,
        tags: tags.trim() || null,
      })
      setTitle(''); setBody(''); setUrl(''); setTags('')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove(note: TrackNote) {
    if (!window.confirm(`Delete note "${note.title}"?`)) return
    try {
      await api.deleteNote(note.id)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function applyFilter(value: string) {
    setFilter(value)
    reload(value)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title"><NotebookPen size={15} /> Research & logs</div>
          <p>Notes, hardware logs, datasheet links — anything useful for future work</p>
        </div>
        <select value={filter} onChange={(e) => applyFilter(e.target.value)}>
          <option value="">All kinds</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      <div className="inv-form">
        <input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input placeholder="Link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input placeholder="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
        <textarea
          className="inv-note-body"
          rows={3}
          placeholder="Details, findings, measurements…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="inv-form-actions">
          <button type="button" className="primary" onClick={create}><Plus size={14} /> Add note</button>
        </div>
      </div>

      {notes.length === 0 && <div className="empty">No notes yet.</div>}
      <div className="track-notes">
        {notes.map((n) => (
          <article className="track-note" key={n.id}>
            <header>
              <span className={`inv-status inv-note-${n.kind}`}>{n.kind}</span>
              <strong>{n.title}</strong>
              {n.url && (
                <a href={n.url} target="_blank" rel="noopener noreferrer" title="Open link">
                  <ExternalLink size={12} />
                </a>
              )}
              <button type="button" className="inv-icon-btn" onClick={() => remove(n)} title="Delete note">
                <Trash2 size={13} />
              </button>
            </header>
            {n.body && <p>{n.body}</p>}
            <footer>
              {n.tags && <span className="track-note-tags">{n.tags}</span>}
              {n.created_at && <time>{new Date(n.created_at).toLocaleDateString()}</time>}
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}
