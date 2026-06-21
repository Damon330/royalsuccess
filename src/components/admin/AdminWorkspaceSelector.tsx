import { useNavigate } from 'react-router-dom'
import { useRestrictedMode } from '../../hooks/useRestrictedMode'
import { RESTRICTED_MODE_PROFILES } from '../../lib/adminModules'
import {
  MdDashboard,
  MdInventory2,
  MdLockOpen,
  MdReceipt,
} from 'react-icons/md'

const OPTIONS = [
  {
    id: 'front-desk',
    label: 'Front Desk',
    detail: 'Inventory and receipts',
    Icon: MdDashboard,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    detail: 'Stock, assignments and returns',
    Icon: MdInventory2,
  },
  {
    id: 'sales',
    label: 'Sales',
    detail: 'Receipts and sales records',
    Icon: MdReceipt,
  },
] as const

export default function AdminWorkspaceSelector() {
  const restrictedMode = useRestrictedMode()
  const navigate = useNavigate()

  function chooseRestricted(profileId: string) {
    const profile = RESTRICTED_MODE_PROFILES.find((item) => item.id === profileId)
    if (!profile) return
    restrictedMode.startRestrictedMode(profile)
    navigate(profile.landingPath ?? '/admin/dashboard', { replace: true })
  }

  function chooseFullAccess() {
    restrictedMode.useFullAccess()
    navigate('/admin/dashboard', { replace: true })
  }

  return (
    <main className="min-h-screen bg-brand-bg flex items-center justify-center p-5">
      <section className="w-full max-w-3xl">
        <header className="mb-7">
          <p className="section-label mb-2">Royal Success</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-text">Choose your workspace</h1>
          <p className="mt-2 text-sm text-brand-muted">Start with only the tools needed for this session.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OPTIONS.map(({ id, label, detail, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseRestricted(id)}
              className="min-h-[150px] text-left border border-brand-border bg-brand-surface rounded-card p-5 hover:border-primary hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            >
              <span className="w-10 h-10 flex items-center justify-center rounded-inner bg-primary/10 text-primary mb-5">
                <Icon className="w-5 h-5" />
              </span>
              <span className="block text-base font-bold text-brand-text">{label}</span>
              <span className="block text-xs text-brand-muted mt-1 leading-relaxed">{detail}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={chooseFullAccess}
          className="mt-3 w-full flex items-center gap-4 border border-brand-border bg-brand-surface rounded-card px-5 py-4 text-left hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
        >
          <span className="w-10 h-10 flex items-center justify-center rounded-inner bg-brand-bg text-brand-muted flex-shrink-0">
            <MdLockOpen className="w-5 h-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-brand-text">Full Admin</span>
            <span className="block text-xs text-brand-muted mt-0.5">All modules and administration tools</span>
          </span>
        </button>
      </section>
    </main>
  )
}
