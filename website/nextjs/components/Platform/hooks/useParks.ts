'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/components/Platform/Toast'

export type ParkRef = { id: string; name?: string }

export function useParks(): { parks: ParkRef[]; loading: boolean } {
  const toast = useToast()
  const [parks, setParks] = useState<ParkRef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchParks() {
      setLoading(true)
      try {
        const raw = await api.parks()
        if (cancelled) return
        // Normalize: API may return ParkRef[] or { parks: ParkRef[] }
        if (Array.isArray(raw)) {
          setParks(raw)
        } else if (raw && typeof raw === 'object' && 'parks' in raw) {
          setParks((raw as { parks: ParkRef[] }).parks ?? [])
        } else {
          setParks([])
        }
      } catch (err) {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : String(err))
        setParks([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchParks()

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { parks, loading }
}
