'use client'

import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/components/Platform/Toast'

export type SettingsBlob = Record<string, Record<string, unknown>>

export function useSettings(): {
  settings: SettingsBlob | null
  loading: boolean
  dirty: boolean
  message: string
  update: (group: string, key: string, value: unknown) => void
  save: () => Promise<void>
  load: () => void
} {
  const toast = useToast()
  const [settings, setSettings] = useState<SettingsBlob | null>(null)
  const [loading, setLoading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const raw = await api.getSettings()
      // Normalize: API may return { settings: blob } or blob directly
      let blob: SettingsBlob
      if (raw && typeof raw === 'object' && 'settings' in raw) {
        blob = (raw as { settings: SettingsBlob }).settings
      } else {
        blob = raw as unknown as SettingsBlob
      }
      setSettings(blob)
      setDirty(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessage(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((group: string, key: string, value: unknown) => {
    setSettings((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [group]: {
          ...(prev[group] ?? {}),
          [key]: value,
        },
      }
    })
    setDirty(true)
  }, [])

  const save = useCallback(async () => {
    if (!settings) return
    setMessage('')
    try {
      await api.putSettings(settings as Record<string, unknown>)
      setDirty(false)
      setMessage('Saved · platform restart may be required for some fields')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessage(msg)
      toast.error(msg)
    }
  }, [settings]) // eslint-disable-line react-hooks/exhaustive-deps

  return { settings, loading, dirty, message, update, save, load }
}
