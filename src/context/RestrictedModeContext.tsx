import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  ADMIN_MODULES,
  getAdminModule,
  sanitizeRestrictedModules,
  type AdminModuleId,
  type RestrictedModeProfile,
  RESTRICTED_MODE_SELECTED_KEY,
  RESTRICTED_MODE_STORAGE_KEY,
} from '../lib/adminModules'

interface RestrictedModeContextValue {
  active: boolean
  selectionRequired: boolean
  profileName: string | null
  allowedModules: AdminModuleId[]
  startRestrictedMode: (profile: RestrictedModeProfile) => void
  useFullAccess: () => void
  stopRestrictedMode: () => void
  isModuleAllowed: (moduleId: AdminModuleId) => boolean
  firstAllowedPath: string
}

export const RestrictedModeContext = createContext<RestrictedModeContextValue>({
  active: false,
  selectionRequired: true,
  profileName: null,
  allowedModules: [],
  startRestrictedMode: () => {},
  useFullAccess: () => {},
  stopRestrictedMode: () => {},
  isModuleAllowed: () => true,
  firstAllowedPath: '/admin/dashboard',
})

function readStoredProfile(): RestrictedModeProfile | null {
  try {
    const raw = sessionStorage.getItem(RESTRICTED_MODE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: string; name?: string; allowedModules?: string[]; landingPath?: string }
    if (!parsed.id || !parsed.name || !Array.isArray(parsed.allowedModules)) return null
    return {
      id: parsed.id,
      name: parsed.name,
      allowedModules: sanitizeRestrictedModules(parsed.allowedModules),
      landingPath: parsed.landingPath,
    }
  } catch {
    return null
  }
}

export function RestrictedModeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const loginMarker = `${session?.user.id ?? 'unknown'}:${session?.user.last_sign_in_at ?? 'current'}`
  const [activeProfile, setActiveProfile] = useState<RestrictedModeProfile | null>(() => readStoredProfile())
  const [selectionRequired, setSelectionRequired] = useState(() => {
    try { return sessionStorage.getItem(RESTRICTED_MODE_SELECTED_KEY) !== loginMarker } catch { return true }
  })

  useEffect(() => {
    try {
      if (activeProfile) {
        sessionStorage.setItem(RESTRICTED_MODE_STORAGE_KEY, JSON.stringify(activeProfile))
      } else {
        sessionStorage.removeItem(RESTRICTED_MODE_STORAGE_KEY)
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
    setSelectionRequired(false)
    try { sessionStorage.setItem(RESTRICTED_MODE_SELECTED_KEY, loginMarker) } catch { /* optional */ }
  }, [loginMarker])

  const useFullAccess = useCallback(() => {
    setActiveProfile(null)
    setSelectionRequired(false)
    try { sessionStorage.setItem(RESTRICTED_MODE_SELECTED_KEY, loginMarker) } catch { /* optional */ }
  }, [loginMarker])

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
    if (activeProfile?.landingPath) {
      const landingModule = ADMIN_MODULES.find((module) => module.paths.includes(activeProfile.landingPath!))
      if (landingModule && isModuleAllowed(landingModule.id)) return activeProfile.landingPath
    }
    const module = ADMIN_MODULES.find((m) => isModuleAllowed(m.id) && m.paths.length > 0)
    return module?.paths[0] ?? '/admin/dashboard'
  }, [activeProfile, isModuleAllowed])

  const value = useMemo<RestrictedModeContextValue>(() => ({
    active: Boolean(activeProfile),
    selectionRequired,
    profileName: activeProfile?.name ?? null,
    allowedModules: activeProfile?.allowedModules ?? [],
    startRestrictedMode,
    useFullAccess,
    stopRestrictedMode,
    isModuleAllowed,
    firstAllowedPath,
  }), [activeProfile, firstAllowedPath, isModuleAllowed, selectionRequired, startRestrictedMode, stopRestrictedMode, useFullAccess])

  return (
    <RestrictedModeContext.Provider value={value}>
      {children}
    </RestrictedModeContext.Provider>
  )
}
