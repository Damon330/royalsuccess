export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  team_lead: 'Team Lead',
  agent: 'Agent',
}

export const STATUS_LABELS: Record<string, string> = {
  pending:  'Pending Approval',
  active:   'Active',
  in_stock: 'In Stock',
  assigned: 'Assigned',
  sold:     'Sold',
  returned: 'Returned',
  damaged:  'Damaged',
}

export const RETURN_REASONS = [
  'Customer rejected',
  'Phone damaged',
  'Wrong model dispatched',
  'Unsold at end of period',
  'Network issues reported',
  'Other',
] as const

export const NAV_ITEMS = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/admin/inventory', label: 'Inventory', icon: 'inventory' },
  { path: '/admin/agents', label: 'Agents', icon: 'agents' },
  { path: '/admin/assign', label: 'Assign Phones', icon: 'assign' },
  { path: '/admin/reports', label: 'Reports', icon: 'reports' },
] as const
