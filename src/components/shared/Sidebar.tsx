import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useReturns } from '../../hooks/useReturns'
import { useProfiles } from '../../hooks/useProfiles'
import { useRestrictedMode } from '../../hooks/useRestrictedMode'
import { supabase } from '../../lib/supabase'
import {
  ADMIN_MODULES,
  RESTRICTED_MODE_PROFILES,
  type AdminModuleId,
} from '../../lib/adminModules'
import { HealthStatusChip } from './SystemHealthMonitor'
import Modal from './Modal'
import Button from './Button'
import toast from 'react-hot-toast'
import {
  MdDashboard, MdInventory2, MdPeople, MdPhoneAndroid,
  MdBarChart, MdLogout, MdUndo, MdHistory, MdReceipt, MdTrendingUp,
  MdAttachMoney, MdPerson, MdSettings, MdBugReport, MdLock, MdLockOpen,
  MdChevronRight,
} from 'react-icons/md'

interface NavItem {
  path:   string
  label:  string
  Icon:   React.ElementType
  moduleId: AdminModuleId
  badge?: number
}

interface NavGroup {
  label: string
  items: NavItem[]
}

function SideNavLink({ path, label, Icon, badge }: NavItem) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-full text-sm transition-all duration-150 group ${
          isActive
            ? 'bg-primary text-white font-semibold shadow-pill'
            : 'text-brand-muted font-medium hover:bg-primary/8 hover:text-brand-text dark:hover:bg-primary/12'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-all duration-150 ${
            isActive ? 'scale-110' : 'group-hover:scale-105 group-hover:text-primary'
          }`} />
          <span className="flex-1 truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center tabular-nums leading-tight ${
              isActive ? 'bg-white/25 text-white' : 'bg-negative text-white'
            }`}>
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { signOut, profile } = useAuth()
  const restrictedMode = useRestrictedMode()
  const navigate = useNavigate()
  const [showStartModal, setShowStartModal] = useState(false)
  const [showExitModal,  setShowExitModal]  = useState(false)
  const [editModules,    setEditModules]    = useState<AdminModuleId[] | null>(null)
  const canReadReturns = restrictedMode.isModuleAllowed('inventory')
  const canReadProfiles = restrictedMode.isModuleAllowed('employees')
  const { pendingCount } = useReturns(undefined, 'sidebar', canReadReturns)
  const { pendingUsers } = useProfiles({ enabled: canReadProfiles })
  const pendingAgents    = pendingUsers.length

  const initials = (profile?.full_name ?? 'A')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out successfully.')
    navigate('/login')
  }

  const groups: NavGroup[] = [
    {
      label: 'Main',
      items: [{ path: '/admin/dashboard', label: 'Dashboard', Icon: MdDashboard, moduleId: 'dashboard' }],
    },
    {
      label: 'Inventory',
      items: [
        { path: '/admin/inventory', label: 'Inventory',     Icon: MdInventory2,   moduleId: 'inventory'              },
        { path: '/admin/assign',    label: 'Assign Phones', Icon: MdPhoneAndroid, moduleId: 'inventory'              },
        { path: '/admin/returns',   label: 'Returns',       Icon: MdUndo,         moduleId: 'inventory', badge: pendingCount },
        { path: '/admin/receipts',  label: 'Receipts',      Icon: MdReceipt,      moduleId: 'sales'                  },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { path: '/admin/reports',  label: 'Reports',  Icon: MdBarChart,    moduleId: 'reports' },
        { path: '/admin/insights', label: 'Insights', Icon: MdTrendingUp,  moduleId: 'reports' },
        { path: '/admin/payroll',  label: 'Payroll',  Icon: MdAttachMoney, moduleId: 'payroll' },
      ],
    },
    {
      label: 'Team',
      items: [
        { path: '/admin/agents',   label: 'Agents',   Icon: MdPeople,  moduleId: 'employees', badge: pendingAgents },
        { path: '/admin/activity', label: 'Activity', Icon: MdHistory, moduleId: 'reports'                       },
      ],
    },
    {
      label: 'Account',
      items: [
        { path: '/admin/profile',      label: 'Profile',      Icon: MdPerson,    moduleId: 'settings'    },
        { path: '/admin/settings',     label: 'Settings',     Icon: MdSettings,  moduleId: 'settings'    },
        { path: '/admin/diagnostics',  label: 'Diagnostics',  Icon: MdBugReport, moduleId: 'diagnostics' },
      ],
    },
  ]

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => restrictedMode.isModuleAllowed(item.moduleId)),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <aside className="
      hidden lg:flex flex-col w-64 h-full
      bg-brand-sidebar
      transition-colors duration-200
    ">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-5 flex-shrink-0">
        <div className="w-10 h-10 bg-gradient-primary rounded-inner flex items-center justify-center flex-shrink-0 shadow-pill">
          <span className="font-black text-[13px] tracking-tight text-white">RS</span>
        </div>
        <div>
          <p className="font-extrabold text-[15px] leading-tight text-brand-text">Royal Success</p>
          <p className="section-label text-[9px] leading-tight mt-0.5">
            Inventory & Field Agent Mgmt
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-4 overflow-y-auto space-y-5">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <p className="section-label px-3 mb-2">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SideNavLink key={item.path} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Account and workspace */}
      <div className="px-3 pb-4 pt-3 flex-shrink-0">
        <div className="h-px bg-brand-border mb-3 mx-2" />

        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-9 h-9 bg-gradient-primary rounded-inner flex items-center justify-center flex-shrink-0 shadow-pill">
            <span className="text-white font-bold text-xs">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-brand-text truncate">{profile?.full_name ?? 'Admin'}</p>
            <p className="text-[11px] text-brand-muted mt-0.5">Administrator</p>
          </div>
        </div>

        <div className="px-1 mb-1">
          <HealthStatusChip showLatency={false} />
        </div>

        <button
          onClick={() => restrictedMode.active ? setShowExitModal(true) : setShowStartModal(true)}
          className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-inner text-left hover:bg-brand-surface focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors"
          title={restrictedMode.active ? 'Change workspace access' : 'Choose workspace access'}
        >
          <span className={`w-8 h-8 rounded-inner flex items-center justify-center flex-shrink-0 ${
            restrictedMode.active
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
              : 'bg-primary/10 text-primary'
          }`}>
            {restrictedMode.active
              ? <MdLock className="w-4 h-4" />
              : <MdLockOpen className="w-4 h-4" />
            }
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] text-brand-muted">Workspace</span>
            <span className="block text-xs font-semibold text-brand-text truncate mt-0.5">
              {restrictedMode.active ? restrictedMode.profileName : 'Full Admin Access'}
            </span>
          </span>
          <MdChevronRight className="w-4 h-4 text-brand-muted/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </button>

        <button
          onClick={handleSignOut}
          className="mt-1 flex items-center gap-3 px-3 py-2 w-full rounded-inner text-xs font-medium text-brand-muted hover:bg-negative/8 hover:text-negative transition-colors group"
        >
          <MdLogout className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          <span>Sign Out</span>
        </button>
      </div>

      <StartRestrictedModeModal
        isOpen={showStartModal}
        onClose={() => { setShowStartModal(false); setEditModules(null) }}
        initialModules={editModules}
      />
      <ExitRestrictedModeModal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        onExited={() => {
          setEditModules(restrictedMode.allowedModules)
          setShowStartModal(true)
          navigate('/admin/dashboard', { replace: true })
        }}
      />
    </aside>
  )
}

function StartRestrictedModeModal({
  isOpen,
  onClose,
  initialModules,
}: {
  isOpen: boolean
  onClose: () => void
  initialModules?: AdminModuleId[] | null
}) {
  const restrictedMode = useRestrictedMode()
  const navigate = useNavigate()
  const selectableModules = ADMIN_MODULES.filter((module) => !module.alwaysAllowed)
  const [selected, setSelected] = useState<AdminModuleId[]>(['inventory', 'sales'])

  useEffect(() => {
    if (isOpen) setSelected(initialModules ?? ['inventory', 'sales'])
  }, [initialModules, isOpen])

  function toggle(moduleId: AdminModuleId) {
    setSelected((prev) =>
      prev.includes(moduleId)
        ? prev.filter((id) => id !== moduleId)
        : [...prev, moduleId],
    )
  }

  function applyProfile(profileId: string) {
    const profile = RESTRICTED_MODE_PROFILES.find((p) => p.id === profileId)
    if (profile) setSelected(profile.allowedModules)
  }

  function start() {
    if (selected.length === 0) {
      toast.error('Choose at least one module.')
      return
    }
    const preset = RESTRICTED_MODE_PROFILES.find((profile) =>
      profile.allowedModules.length === selected.length
      && profile.allowedModules.every((moduleId) => selected.includes(moduleId)),
    )
    const workspace = preset ?? {
      id: 'custom',
      name: 'Custom Workspace',
      allowedModules: selected,
      landingPath: '/admin/dashboard',
    }
    restrictedMode.startRestrictedMode(workspace)
    navigate(workspace.landingPath ?? '/admin/dashboard', { replace: true })
    toast.success(`${workspace.name} applied.`)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose Workspace Access" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {RESTRICTED_MODE_PROFILES.map((profile) => (
            <button
              key={profile.id}
              onClick={() => applyProfile(profile.id)}
              className="rounded-inner border border-brand-border px-3 py-2 text-xs font-semibold text-brand-text hover:border-primary hover:bg-primary/8 transition-colors text-left"
            >
              {profile.name}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="section-label">Available Modules</p>
          <label className="flex items-start gap-3 rounded-inner border border-brand-border bg-brand-bg px-3 py-3 opacity-80">
            <input type="checkbox" checked readOnly className="mt-0.5 accent-primary" />
            <span>
              <span className="block text-sm font-bold text-brand-text">Dashboard</span>
              <span className="block text-xs text-brand-muted">Always available as the home page</span>
            </span>
          </label>
          {selectableModules.map((module) => (
            <label
              key={module.id}
              className="flex items-start gap-3 rounded-inner border border-brand-border px-3 py-3 hover:bg-brand-bg transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(module.id)}
                onChange={() => toggle(module.id)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="block text-sm font-bold text-brand-text">{module.label}</span>
                <span className="block text-xs text-brand-muted">{module.description}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={start} fullWidth>Apply Access</Button>
        </div>
      </div>
    </Modal>
  )
}

function ExitRestrictedModeModal({
  isOpen,
  onClose,
  onExited,
}: {
  isOpen: boolean
  onClose: () => void
  onExited: () => void
}) {
  const { session } = useAuth()
  const restrictedMode = useRestrictedMode()
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)

  async function verifyAndExit() {
    const email = session?.user.email
    if (!email) {
      toast.error('Admin session is unavailable.')
      return
    }
    if (!password.trim()) {
      toast.error('Enter the administrator password.')
      return
    }

    setChecking(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setChecking(false)

    if (error) {
      toast.error('Password incorrect. Restricted Mode is still active.')
      return
    }

    restrictedMode.stopRestrictedMode()
    setPassword('')
    toast.success('Administrator access confirmed.')
    onClose()
    onExited()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Authorize Access Change" maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-brand-muted">
          Re-enter the administrator password to change the visible workspace tools.
        </p>
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Administrator Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') verifyAndExit() }}
            autoFocus
            className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-brand-surface"
          />
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={verifyAndExit} loading={checking} fullWidth>Continue</Button>
        </div>
      </div>
    </Modal>
  )
}
