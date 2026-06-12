'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { api } from '@/lib/api'

// Only an unlock FLAG is stored client-side — the password itself is verified
// by the backend (AXALON_TRACK_PASSWORD env) and never persisted here.
const UNLOCK_FLAG = 'axalon_track_unlocked'

export function TrackGate({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    setIsUnlocked(sessionStorage.getItem(UNLOCK_FLAG) === '1')
    setIsChecking(false)
  }, [])

  async function submit() {
    if (!password) {
      setError('Enter the workspace password')
      return
    }
    setIsBusy(true)
    setError('')
    try {
      await api.trackLogin(password)
      sessionStorage.setItem(UNLOCK_FLAG, '1')
      setPassword('')
      setIsUnlocked(true)
    } catch {
      setError('Wrong password')
    } finally {
      setIsBusy(false)
    }
  }

  if (isChecking) return null
  if (isUnlocked) return <>{children}</>

  return (
    <div className="auth-gate">
      <div className="auth-gate-panel">
        <h2>
          <Lock size={16} /> Track workspace
        </h2>
        <p>Inventory, prototypes, orders, research — enter the workspace password.</p>
        <input
          type="password"
          autoFocus
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <p className="auth-gate-error">{error}</p>}
        <button type="button" disabled={isBusy} onClick={submit}>
          {isBusy ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </div>
  )
}
