import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ADMIN_MODULES,
  getAdminModule,
  sanitizeRestrictedModules,
  type AdminModuleId,
  type RestrictedModeProfile,
} from '../lib/adminModules'

interface RestrictedModeContextValue {
  active: boolean
  profileName: string | null
  allowedModules: AdminModuleId[]
  startRestrictedMode: (profile: RestrictedModeProfile) => void
  stopRestrictedMode: () => void
  isModuleAllowed: (moduleId: AdminModuleId) => boolean
  firstAllowedPath: string
}

const STORAGE_KEY = 'royal-success:restricted-mode:v1'

export const RestrictedModeContext = createContext<RestrictedModeContextValue>({
  active: false,
  profileName: null,
  allowedModules: [],
  startRestrictedMode: () => {},
  stopRestrictedMode: () => {},
  isModuleAllowed: () => true,
  firstAllowedPath: '/admin/dashboard',
})

function readStoredProfile(): RestrictedModeProfile | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: string; name?: string; allowedModules?: string[] }
    if (!parsed.id || !parsed.name || !Array.isArray(parsed.allowedModules)) return null
    return {
      id: parsed.id,
      name: parsed.name,
      allowedModules: sanitizeRestrictedModules(parsed.allowedModules),
    }
  } catch {
    return null
  }
}

export function RestrictedModeProvider({ children }: { children: ReactNode }) {
  const [activeProfile, setActiveProfile] = useState<RestrictedModeProfile | null>(() => readStoredProfile())

  useEffect(() => {
    try {
      if (activeProfile) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(activeProfile))
      } else {
        sessionStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Session storage is a convenience only; app state remains authoritative.
    }
  }, [activeProfile])

  const startRestrictedMode = useCallback((profile: RestrictedModeProfile) => {
    setActiveProfile({
      ...profile,
      allowedModules: sanitizeRestrictedModules(profile.allowedModules),
    })
  }, [])

  const stopRestrictedMode = useCallback(() => {
    setActiveProfile(null)
  }, [])

  const isModuleAllowed = useCallback((moduleId: AdminModuleId) => {
    const module = getAdminModule(moduleId)
    if (module.alwaysAllowed) return true
    if (!activeProfile) return true
    return activeProfile.allowedModules.includes(moduleId)
  }, [activeProfile])

  const firstAllowedPath = useMemo(() => {
    const module = ADMIN_MODULES.find((m) => isModuleAllowed(m.id) && m.paths.length > 0)
    return module?.paths[0] ?? '/admin/dashboard'
  }, [isModuleAllowed])

  const value = useMemo<RestrictedModeContextValue>(() => ({
    active: Boolean(activeProfile),
    profileName: activeProfile?.name ?? null,
    allowedModules: activeProfile?.allowedModules ?? [],
    startRestrictedMode,
    stopRestrictedMode,
    isModuleAllowed,
    firstAllowedPath,
  }), [activeProfile, firstAllowedPath, isModuleAllowed, startRestrictedMode, stopRestrictedMode])

  return (
    <RestrictedModeContext.Provider value={value}>
      {children}
    </RestrictedModeContext.Provider>
  )
}
