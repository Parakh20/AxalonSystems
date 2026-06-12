'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, Trash2, Upload } from 'lucide-react'
import { api, type TrackFileMeta } from '@/lib/api'
import { useToast } from '@/components/Platform/Toast'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function TrackFilesPanel() {
  const toast = useToast()
  const [files, setFiles] = useState<TrackFileMeta[]>([])
  const [label, setLabel] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function reload() {
    try {
      setFiles(await api.trackFiles())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function upload(selected: File) {
    const form = new FormData()
    form.append('file', selected)
    if (label.trim()) form.append('label', label.trim())
    setIsBusy(true)
    try {
      await api.uploadTrackFile(form)
      setLabel('')
      if (inputRef.current) inputRef.current.value = ''
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setIsBusy(false)
    }
  }

  async function remove(f: TrackFileMeta) {
    if (!window.confirm(`Delete "${f.original_name}"?`)) return
    try {
      await api.deleteTrackFile(f.id)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title"><FolderOpen size={15} /> File library</div>
          <p>CAD models (.stl/.step), datasheets (.pdf), photos — up to 200 MB each</p>
        </div>
      </div>

      <div className="inv-form">
        <input
          placeholder="Label (e.g. Camera mount v2 print file)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className="track-upload">
          <Upload size={14} /> {isBusy ? 'Uploading…' : 'Choose file'}
          <input
            ref={inputRef}
            type="file"
            hidden
            disabled={isBusy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
            }}
          />
        </label>
      </div>

      {files.length === 0 && <div className="empty">No files uploaded yet.</div>}
      {files.length > 0 && (
        <div className="table">
          <div className="table-head track-file-head">
            <span>File</span>
            <span>Size</span>
            <span>Uploaded</span>
            <span />
          </div>
          {files.map((f) => (
            <div className="track-file-row" key={f.id}>
              <span className="inv-part">
                <strong>{f.original_name}</strong>
                {f.label && <small>{f.label}</small>}
              </span>
              <span>{formatBytes(f.size_bytes)}</span>
              <span>{f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}</span>
              <span className="track-file-actions">
                <a className="inv-icon-btn" href={api.trackFileUrl(f.id)} title="Download">
                  <Download size={14} />
                </a>
                <button type="button" className="inv-icon-btn" onClick={() => remove(f)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
