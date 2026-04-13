import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../api/client'

export const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/api/auth/me')
      setSession(me)
      return me
    } catch (e) {
      if (e.status === 401) {
        setSession(null)
        return null
      }
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout') } catch (_) {}
    setSession(null)
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading, setSession, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
