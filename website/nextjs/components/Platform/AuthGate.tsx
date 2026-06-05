'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

const KEY_STORAGE = 'axalon_api_key'

type AuthContextValue = {
  apiKey: string
  setApiKey: (key: string) => void
}

const AuthCtx = createContext<AuthContextValue>({
  apiKey: '',
  setApiKey: () => {},
})

export function useApiKey() {
  return useContext(AuthCtx)
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState('')
  const [locked, setLocked] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = sessionStorage.getItem(KEY_STORAGE)
    const envKey = process.env.NEXT_PUBLIC_AXALON_API_KEY ?? ''
    const key = stored ?? envKey
    if (key) {
      sessionStorage.setItem(KEY_STORAGE, key)
      setApiKeyState(key)
    } else {
      setLocked(true)
    }
  }, [])

  useEffect(() => {
    function onUnauthorized() {
      setLocked(true)
    }
    window.addEventListener('axalon:unauthorized', onUnauthorized)
    return () => window.removeEventListener('axalon:unauthorized', onUnauthorized)
  }, [])

  const setApiKey = useCallback((key: string) => {
    sessionStorage.setItem(KEY_STORAGE, key)
    setApiKeyState(key)
  }, [])

  function submit() {
    const trimmed = input.trim()
    if (!trimmed) {
      setError('Enter a key')
      return
    }
    setApiKey(trimmed)
    setLocked(false)
    setError('')
    setInput('')
  }

  return (
    <AuthCtx.Provider value={{ apiKey, setApiKey }}>
      {children}
      {locked && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="API key required"
          className="auth-gate"
        >
          <div className="auth-gate-panel">
            <h2>API key required</h2>
            <p>The server requires an API key. It is stored for this browser session only.</p>
            <input
              type="password"
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder="Bearer key"
            />
            {error && <div className="auth-gate-error">{error}</div>}
            <button type="button" onClick={submit}>
              Unlock
            </button>
          </div>
        </div>
      )}
    </AuthCtx.Provider>
  )
}
