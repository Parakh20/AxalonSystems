// website/nextjs/components/Platform/PlanSidebar.tsx
'use client'

import { useState } from 'react'
import { Download, Save, Trash2 } from 'lucide-react'
import type { Camera } from '@/lib/cameras'
import { CAMERAS } from '@/lib/cameras'
import type { MissionParams, MissionType, MissionStats } from '@/lib/missionGeometry'
import { computeFootprint } from '@/lib/missionGeometry'
import type { MissionSummary } from '@/lib/api'
import type { ExportFormat } from '@/lib/waypointExport'

type Props = {
  missionName: string
  onMissionNameChange: (v: string) => void
  parkId: string
  onParkIdChange: (v: string) => void
  missionType: MissionType
  onMissionTypeChange: (t: MissionType) => void
  camera: Camera
  onCameraChange: (c: Camera) => void
  params: MissionParams
  onParamsChange: (p: MissionParams) => void
  stats: MissionStats | null
  savedMissions: MissionSummary[]
  onLoadMission: (id: number) => void
  onDeleteMission: (id: number) => void
  onExport: (format: ExportFormat) => void
  onSave: () => void
  canExport: boolean
}

const TYPES: MissionType[] = ['grid', 'perimeter', 'corridor']

const EXPORT_FORMATS: { value: ExportFormat; label: string; short: string }[] = [
  { value: 'litchi', label: 'Litchi CSV', short: 'Litchi CSV' },
  { value: 'kml', label: 'KML (Google Earth)', short: 'KML' },
  { value: 'plan', label: 'QGroundControl .plan', short: '.plan' },
  { value: 'waypoints', label: 'ArduPilot .waypoints', short: '.waypoints' },
]

export default function PlanSidebar(props: Props) {
  const {
    missionName, onMissionNameChange, parkId, onParkIdChange,
    missionType, onMissionTypeChange, camera, onCameraChange,
    params, onParamsChange, savedMissions,
    onLoadMission, onDeleteMission, onExport, onSave, canExport,
  } = props

  const [exportFormat, setExportFormat] = useState<ExportFormat>('litchi')
  const fp = computeFootprint(camera, params)
  const exportLabel = EXPORT_FORMATS.find((f) => f.value === exportFormat)?.short ?? 'file'

  function setCamById(id: string) {
    const next = CAMERAS.find((c) => c.id === id)
    if (next) onCameraChange(next)
  }

  function patchParams(patch: Partial<MissionParams>) {
    onParamsChange({ ...params, ...patch })
  }

  function patchCamera(patch: Partial<Camera>) {
    onCameraChange({ ...camera, ...patch })
  }

  return (
    <aside className="plan-sidebar">
      {/* Mission */}
      <section className="panel">
        <div className="panel-head compact"><div className="panel-title">Mission</div></div>
        <div className="plan-param">
          <input
            value={missionName}
            onChange={(e) => onMissionNameChange(e.target.value)}
            placeholder="Mission name"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <input
            value={parkId}
            onChange={(e) => onParkIdChange(e.target.value)}
            placeholder="Park ID (optional)"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 8 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={t === missionType ? 'primary' : 'secondary'}
                style={{ flex: 1, textTransform: 'capitalize', padding: '5px' }}
                onClick={() => onMissionTypeChange(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Camera */}
      <section className="panel">
        <div className="panel-head compact"><div className="panel-title">Camera</div></div>
        <div className="plan-param">
          <select
            value={camera.id}
            onChange={(e) => setCamById(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          >
            {CAMERAS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="plan-camera-card">
            {camera.custom ? (
              <>
                <label>Sensor W (mm)
                  <input type="number" step="0.01" value={camera.sensorWidthMm}
                    onChange={(e) => patchCamera({ sensorWidthMm: Number(e.target.value) })} />
                </label>
                <label>Sensor H (mm)
                  <input type="number" step="0.01" value={camera.sensorHeightMm}
                    onChange={(e) => patchCamera({ sensorHeightMm: Number(e.target.value) })} />
                </label>
                <label>Focal (mm)
                  <input type="number" step="0.1" value={camera.focalLengthMm}
                    onChange={(e) => patchCamera({ focalLengthMm: Number(e.target.value) })} />
                </label>
                <label>Res W (px)
                  <input type="number" value={camera.resolutionW}
                    onChange={(e) => patchCamera({ resolutionW: Number(e.target.value) })} />
                </label>
              </>
            ) : (
              <>
                <div className="cam-row"><span>Sensor</span><span>{camera.sensorWidthMm} × {camera.sensorHeightMm} mm</span></div>
                <div className="cam-row"><span>Focal length</span><span>{camera.focalLengthMm} mm</span></div>
                <div className="cam-row"><span>Resolution</span><span>{camera.resolutionW} × {camera.resolutionH} px</span></div>
              </>
            )}
            <div className="cam-row" style={{ marginTop: 4 }}>
              <span>Footprint @ {params.altitudeM}m</span>
              <span style={{ color: '#0ea5e9' }}>{fp.w.toFixed(1)} × {fp.h.toFixed(1)} m</span>
            </div>
          </div>
        </div>
      </section>

      {/* Flight params */}
      <section className="panel">
        <div className="panel-head compact"><div className="panel-title">Flight Params</div></div>
        <div className="plan-param">
          <label>Altitude <span>{params.altitudeM} m</span></label>
          <input type="range" min={10} max={120} value={params.altitudeM}
            onChange={(e) => patchParams({ altitudeM: Number(e.target.value) })} />
          <label>Front overlap <span>{Math.round(params.frontOverlap * 100)} %</span></label>
          <input type="range" min={50} max={95} value={Math.round(params.frontOverlap * 100)}
            onChange={(e) => patchParams({ frontOverlap: Number(e.target.value) / 100 })} />
          <label>Side overlap <span>{Math.round(params.sideOverlap * 100)} %</span></label>
          <input type="range" min={50} max={95} value={Math.round(params.sideOverlap * 100)}
            onChange={(e) => patchParams({ sideOverlap: Number(e.target.value) / 100 })} />
          <label>Speed <span>{params.speedMs} m/s</span></label>
          <input type="range" min={3} max={15} value={params.speedMs}
            onChange={(e) => patchParams({ speedMs: Number(e.target.value) })} />
        </div>
      </section>

      {/* Saved missions */}
      <section className="panel">
        <div className="panel-head compact"><div className="panel-title">Saved Missions</div></div>
        <div className="plan-param">
          {savedMissions.length === 0 && <div className="empty" style={{ fontSize: 12 }}>No saved missions</div>}
          {savedMissions.map((m) => (
            <div key={m.id} className="queue-item" style={{ marginBottom: 4 }}>
              <div className="queue-row" onClick={() => onLoadMission(m.id)} style={{ cursor: 'pointer' }}>
                <strong>{m.name}</strong>
                <button className="secondary" style={{ padding: 2 }} onClick={(e) => { e.stopPropagation(); onDeleteMission(m.id) }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="queue-row sub">
                <span className="muted">{m.mission_type} · {m.area_ha?.toFixed(1) ?? '–'} ha</span>
                <span className="muted">{m.image_count ?? '–'} img</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Actions */}
      <section className="panel" style={{ marginTop: 'auto' }}>
        <div className="plan-param">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 6 }}
            aria-label="Export format"
          >
            {EXPORT_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <button className="primary" style={{ width: '100%', marginBottom: 6 }} disabled={!canExport} onClick={() => onExport(exportFormat)}>
            <Download size={15} /> Export {exportLabel}
          </button>
          <button className="secondary" style={{ width: '100%' }} disabled={!canExport} onClick={onSave}>
            <Save size={15} /> Save Mission
          </button>
        </div>
      </section>
    </aside>
  )
}
