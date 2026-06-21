export type AdminModuleId =
  | 'dashboard'
  | 'inventory'
  | 'sales'
  | 'payroll'
  | 'employees'
  | 'reports'
  | 'settings'
  | 'diagnostics'

export interface AdminModuleDefinition {
  id: AdminModuleId
  label: string
  description: string
  paths: string[]
  alwaysAllowed?: boolean
}

export const ADMIN_MODULES: AdminModuleDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Overview and basic status',
    paths: ['/admin/dashboard'],
    alwaysAllowed: true,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Stock, assignment, returns, and phone lookup',
    paths: ['/admin/inventory', '/admin/assign', '/admin/returns'],
  },
  {
    id: 'sales',
    label: 'Sales',
    description: 'Receipts and sales records',
    paths: ['/admin/receipts'],
  },
  {
    id: 'payroll',
    label: 'Payroll',
    description: 'Payroll rules, targets, runs, and history',
    paths: ['/admin/payroll'],
  },
  {
    id: 'employees',
    label: 'Employees / User Management',
    description: 'Agents, team leads, approvals, and role changes',
    paths: ['/admin/agents'],
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Reports, insights, and activity history',
    paths: ['/admin/reports', '/admin/insights', '/admin/activity'],
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Profile and account settings',
    paths: ['/admin/profile', '/admin/settings'],
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'System checks and troubleshooting',
    paths: ['/admin/diagnostics'],
  },
]

export interface RestrictedModeProfile {
  id: string
  name: string
  allowedModules: AdminModuleId[]
  landingPath?: string
}

export const RESTRICTED_MODE_STORAGE_KEY = 'royal-success:restricted-mode:v1'
export const RESTRICTED_MODE_SELECTED_KEY = 'royal-success:workspace-selected:v1'

export function clearRestrictedModeSession() {
  try {
    sessionStorage.removeItem(RESTRICTED_MODE_STORAGE_KEY)
    sessionStorage.removeItem(RESTRICTED_MODE_SELECTED_KEY)
  } catch {
    // Storage is optional; auth state remains authoritative.
  }
}

export const RESTRICTED_MODE_PROFILES: RestrictedModeProfile[] = [
  {
    id: 'front-desk',
    name: 'Front Desk Mode',
    allowedModules: ['inventory', 'sales'],
    landingPath: '/admin/inventory',
  },
  {
    id: 'inventory',
    name: 'Inventory Mode',
    allowedModules: ['inventory'],
    landingPath: '/admin/inventory',
  },
  {
    id: 'sales',
    name: 'Sales Mode',
    allowedModules: ['sales'],
    landingPath: '/admin/receipts',
  },
]

const ROUTE_MODULES = ADMIN_MODULES
  .flatMap((module) => module.paths.map((path) => ({ path, moduleId: module.id })))
  .sort((a, b) => b.path.length - a.path.length)

export function getAdminModuleForPath(pathname: string): AdminModuleId | null {
  const normalized = pathname.replace(/\/+$/, '') || '/admin/dashboard'
  const match = ROUTE_MODULES.find(({ path }) =>
    normalized === path || normalized.startsWith(`${path}/`),
  )
  return match?.moduleId ?? null
}

export function getAdminModule(id: AdminModuleId): AdminModuleDefinition {
  const module = ADMIN_MODULES.find((m) => m.id === id)
  if (!module) throw new Error(`Unknown admin module: ${id}`)
  return module
}

export function isKnownAdminModule(id: string): id is AdminModuleId {
  return ADMIN_MODULES.some((module) => module.id === id)
}

export function sanitizeRestrictedModules(ids: string[]): AdminModuleId[] {
  const unique = new Set<AdminModuleId>()
  for (const id of ids) {
    if (isKnownAdminModule(id) && !getAdminModule(id).alwaysAllowed) unique.add(id)
  }
  return [...unique]
}
