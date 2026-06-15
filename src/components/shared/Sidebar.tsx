import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useReturns } from '../../hooks/useReturns'
import { useProfiles } from '../../hooks/useProfiles'
import toast from 'react-hot-toast'
import {
  MdDashboard, MdInventory2, MdPeople, MdPhoneAndroid,
  MdBarChart, MdLogout, MdUndo, MdHistory, MdReceipt, MdTrendingUp,
  MdAttachMoney, MdPerson, MdSettings,
} from 'react-icons/md'

interface NavItem {
  path:    string
  label:   string
  Icon:    React.ElementType
  badge?:  number
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
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-white text-primary font-semibold shadow-sm'
            : 'text-white/65 hover:bg-white/10 hover:text-white'
        }`
      }
    >
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center tabular-nums leading-tight">
          {badge}
        </span>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const { pendingCount }  = useReturns(undefined, 'sidebar')
  const { pendingUsers }  = useProfiles()
  const pendingAgents     = pendingUsers.length

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
      items: [
        { path: '/admin/dashboard', label: 'Dashboard', Icon: MdDashboard },
      ],
    },
    {
      label: 'Inventory',
      items: [
        { path: '/admin/inventory', label: 'Inventory',     Icon: MdInventory2   },
        { path: '/admin/assign',    label: 'Assign Phones', Icon: MdPhoneAndroid },
        { path: '/admin/returns',   label: 'Returns',       Icon: MdUndo,    badge: pendingCount   },
        { path: '/admin/receipts',  label: 'Receipts',      Icon: MdReceipt  },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { path: '/admin/reports',  label: 'Reports',  Icon: MdBarChart   },
        { path: '/admin/insights', label: 'Insights', Icon: MdTrendingUp },
        { path: '/admin/payroll',  label: 'Payroll',  Icon: MdAttachMoney },
      ],
    },
    {
      label: 'Team',
      items: [
        { path: '/admin/agents',   label: 'Agents',   Icon: MdPeople,  badge: pendingAgents },
        { path: '/admin/activity', label: 'Activity', Icon: MdHistory  },
      ],
    },
    {
      label: 'Account',
      items: [
        { path: '/admin/profile',  label: 'Profile',  Icon: MdPerson   },
        { path: '/admin/settings', label: 'Settings', Icon: MdSettings },
      ],
    },
  ]

  return (
    <aside className="hidden lg:flex flex-col w-64 h-full bg-gradient-to-b from-primary-dark via-primary to-primary-light text-white">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10 flex-shrink-0">
        <div className="w-10 h-10 bg-white/15 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/20">
          <span className="font-black text-[13px] tracking-tight text-white">RS</span>
        </div>
        <div>
          <p className="font-extrabold text-[16px] leading-tight tracking-tight">Royal Success</p>
          <p className="text-white/45 text-[11px] font-semibold uppercase tracking-widest">Inventory System</p>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest px-3 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SideNavLink key={item.path} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="px-3 pb-4 pt-3 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3 px-3 py-3 mb-1">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 border border-white/20">
            <span className="text-white font-bold text-sm">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{profile?.full_name ?? 'Admin'}</p>
            <p className="text-[11px] text-white/45 font-medium">Administrator</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-all duration-150 w-full"
        >
          <MdLogout className="w-[18px] h-[18px]" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
