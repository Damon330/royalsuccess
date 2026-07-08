import { createContext, useContext, ReactNode } from 'react'
import { useSystemHealth, type HealthState, type HealthStatus } from '../hooks/useSystemHealth'

interface SystemHealthContextValue {
  health:      HealthState
  recheckNow:  () => Promise<void>
}

const SystemHealthContext = createContext<SystemHealthContextValue | null>(null)

export function SystemHealthProvider({ children }: { children: ReactNode }) {
  const value = useSystemHealth()
  return (
    <SystemHealthContext.Provider value={value}>
      {children}
    </SystemHealthContext.Provider>
  )
}

export function useHealth(): SystemHealthContextValue {
  const ctx = useContext(SystemHealthContext)
  if (!ctx) throw new Error('useHealth must be used inside SystemHealthProvider')
  return ctx
}

export type { HealthState, HealthStatus }
