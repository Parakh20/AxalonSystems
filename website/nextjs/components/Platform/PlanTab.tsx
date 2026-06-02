// website/nextjs/components/Platform/PlanTab.tsx
'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/Platform/Toast'
import { api, ApiError, type MissionSummary } from '@/lib/api'
import { DEFAULT_CAMERA, getCamera, type Camera } from '@/lib/cameras'
import {
  generateGrid,
  generatePerimeter,
  generateCorridor,
  generateOrbit,
  splitByBattery,
  computeStats,
  computeFootprint,
  type LatLon,
  type MissionParams,
  type MissionType,
  type Waypoint,
} from '@/lib/missionGeometry'
import { downloadMission, type ExportFormat } from '@/lib/waypointExport'
import PlanSidebar from '@/components/Platform/PlanSidebar'

const PlanMap = dynamic(() => import('@/components/Platform/PlanMap'), {
  ssr: false,
  loading: () => (
    <div className="plan-map" style={{ display: 'grid', placeItems: 'center', color: '#64748b' }}>
      Loading map…
    </div>
  ),
})

const DEFAULT_PARAMS: MissionParams = {
  altitudeM: 20,
  frontOverlap: 0.8,
  sideOverlap: 0.7,
  speedMs: 8,
  headingDeg: 'auto',
  batteryMinutes: 18,
  batteryReservePct: 20,
  orbitRadiusM: 30,
  orbitPhotoCount: 16,
}

export function PlanTab() {
  const toast = useToast()
  const [missionName, setMissionName] = useState('New Mission')
  const [parkId, setParkId] = useState('')
  const [missionType, setMissionType] = useState<MissionType>('grid')
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA)
  const [params, setParams] = useState<MissionParams>(DEFAULT_PARAMS)
  const [polygon, setPolygon] = useState<LatLon[] | null>(null)
  const [savedMissions, setSavedMissions] = useState<MissionSummary[]>([])

  const waypoints = useMemo(() => {
    let base: Waypoint[] = []
    if (missionType === 'orbit') {
      base = polygon && polygon.length >= 1 ? generateOrbit(polygon[0], camera, params) : []
    } else if (polygon && polygon.length >= 2) {
      if (missionType === 'grid') base = generateGrid(polygon, camera, params)
      else if (missionType === 'perimeter') base = generatePerimeter(polygon, camera, params)
      else base = generateCorridor(polygon, camera, params)
    }
    return splitByBattery(base, params).waypoints
  }, [polygon, camera, params, missionType])

  const stats = useMemo(() => {
    if (waypoints.length < 2 || !polygon) return null
    return computeStats(waypoints, polygon, camera, params)
  }, [waypoints, polygon, camera, params])

  async function refreshMissions() {
    try {
      const list = await api.missions(parkId || undefined)
      setSavedMissions(list)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  useEffect(() => {
    refreshMissions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExport(format: ExportFormat) {
    if (waypoints.length < 2) return
    const fp = computeFootprint(camera, params)
    const triggerDist = Math.max(fp.h * (1 - params.frontOverlap), 0.5)
    downloadMission(waypoints, params, missionName, triggerDist, format)
  }

  async function handleSave() {
    if (waypoints.length < 2 || !polygon || !stats) {
      toast.error('Draw a survey area first')
      return
    }
    try {
      await api.createMission({
        name: missionName,
        park_id: parkId || null,
        mission_type: missionType,
        camera_id: camera.id,
        params: params as unknown as Record<string, unknown>,
        polygon,
        waypoints,
        area_ha: stats.areaHa,
        image_count: stats.imageCount,
      })
      toast.success(`Saved "${missionName}"`)
      refreshMissions()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  async function handleLoad(id: number) {
    try {
      const m = await api.mission(id)
      setMissionName(m.name)
      setParkId(m.park_id ?? '')
      setMissionType(m.mission_type)
      setCamera(getCamera(m.camera_id ?? DEFAULT_CAMERA.id))
      setParams({ ...DEFAULT_PARAMS, ...(m.params as Partial<MissionParams>) })
      setPolygon(m.polygon.length ? m.polygon : null)
      toast.success(`Loaded "${m.name}"`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteMission(id)
      refreshMissions()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  return (
    <div className="plan-layout">
      <div className="plan-map-wrap">
        <PlanMap
          missionType={missionType}
          polygon={polygon}
          waypoints={waypoints}
          stats={stats}
          orbitRadiusM={params.orbitRadiusM}
          onShapeDrawn={setPolygon}
          onClear={() => setPolygon(null)}
        />
      </div>
      <PlanSidebar
        missionName={missionName}
        onMissionNameChange={setMissionName}
        parkId={parkId}
        onParkIdChange={setParkId}
        missionType={missionType}
        onMissionTypeChange={setMissionType}
        camera={camera}
        onCameraChange={setCamera}
        params={params}
        onParamsChange={setParams}
        stats={stats}
        savedMissions={savedMissions}
        onLoadMission={handleLoad}
        onDeleteMission={handleDelete}
        onExport={handleExport}
        onSave={handleSave}
        canExport={waypoints.length >= 2}
      />
    </div>
  )
}
