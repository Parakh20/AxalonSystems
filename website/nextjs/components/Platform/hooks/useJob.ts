'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type BatchJob = {
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

const DEMO_JOB_ID = 'batch-8f24c91a'

const INITIAL_JOBS: BatchJob[] = [
  {
    id: DEMO_JOB_ID,
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
]

export function useJob(): {
  jobs: BatchJob[]
  activeJob: BatchJob
  activeJobId: string
  setActiveJobId: (id: string) => void
  addJob: (job: BatchJob) => void
} {
  const [jobs, setJobs] = useState<BatchJob[]>(INITIAL_JOBS)
  const [activeJobId, setActiveJobId] = useState<string>(DEMO_JOB_ID)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addJob = useCallback((job: BatchJob) => {
    setJobs((prev) => [job, ...prev])
    setActiveJobId(job.id)
  }, [])

  // Polling loop for real (non-demo) jobs that are still in flight
  useEffect(() => {
    function startPolling() {
      if (intervalRef.current) clearInterval(intervalRef.current)

      intervalRef.current = setInterval(async () => {
        setJobs((prev) => {
          // Identify jobs that need polling
          const pollable = prev.filter(
            (j) =>
              j.id !== DEMO_JOB_ID &&
              (j.status === 'queued' || j.status === 'processing'),
          )

          if (pollable.length === 0) return prev

          // Fire-and-forget fetches; update state when responses arrive
          pollable.forEach(async (job) => {
            try {
              const statusRes = await api.status(job.id)
              setJobs((current) =>
                current.map((j) => {
                  if (j.id !== job.id) return j
                  // Map API state strings to our JobStatus type
                  let status: JobStatus = j.status
                  if (statusRes.state === 'queued') status = 'queued'
                  else if (statusRes.state === 'running') status = 'processing'
                  else if (statusRes.state === 'succeeded') status = 'completed'
                  else if (statusRes.state === 'failed') status = 'failed'

                  return {
                    ...j,
                    status,
                    progress:
                      statusRes.progress != null
                        ? statusRes.progress
                        : j.progress,
                    processed:
                      statusRes.processed != null
                        ? statusRes.processed
                        : j.processed,
                    total:
                      statusRes.total != null ? statusRes.total : j.total,
                    error: statusRes.message ?? j.error,
                  }
                }),
              )
            } catch (err) {
              console.warn(`[useJob] poll failed for job ${job.id}:`, err)
            }
          })

          return prev // state update comes from async callbacks above
        })
      }, 1800)
    }

    startPolling()

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? jobs[0]

  return {
    jobs,
    activeJob,
    activeJobId,
    setActiveJobId,
    addJob,
  }
}
