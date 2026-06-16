import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { useReturns } from '../../hooks/useReturns'
import { useProfiles } from '../../hooks/useProfiles'
import { HealthStatusChip } from './SystemHealthMonitor'
import toast from 'react-hot-toast'
import {
  MdDashboard, MdInventory2, MdPeople, MdPhoneAndroid,
  MdBarChart, MdLogout, MdUndo, MdHistory, MdReceipt, MdTrendingUp,
  MdAttachMoney, MdPerson, MdSettings,
} from 'react-icons/md'

interface NavItem {
  path:   string
  label:  string
  Icon:   React.ElementType
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
  const navigate = useNavigate()
  const { pendingCount } = useReturns(undefined, 'sidebar')
  const { pendingUsers } = useProfiles()
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
      items: [{ path: '/admin/dashboard', label: 'Dashboard', Icon: MdDashboard }],
    },
    {
      label: 'Inventory',
      items: [
        { path: '/admin/inventory', label: 'Inventory',     Icon: MdInventory2                        },
        { path: '/admin/assign',    label: 'Assign Phones', Icon: MdPhoneAndroid                      },
        { path: '/admin/returns',   label: 'Returns',       Icon: MdUndo,    badge: pendingCount       },
        { path: '/admin/receipts',  label: 'Receipts',      Icon: MdReceipt                           },
      ],
    },
    {
      label: 'Analytics',
      items: [
        { path: '/admin/reports',  label: 'Reports',  Icon: MdBarChart    },
        { path: '/admin/insights', label: 'Insights', Icon: MdTrendingUp  },
        { path: '/admin/payroll',  label: 'Payroll',  Icon: MdAttachMoney },
      ],
    },
    {
      label: 'Team',
      items: [
        { path: '/admin/agents',   label: 'Agents',   Icon: MdPeople,  badge: pendingAgents },
        { path: '/admin/activity', label: 'Activity', Icon: MdHistory                       },
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
        {groups.map((group) => (
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

      {/* User card */}
      <div className="px-3 pb-5 pt-3 flex-shrink-0">
        {/* Divider */}
        <div className="h-px bg-brand-border mb-3 mx-1" />

        <motion.div
          whileHover={{ scale: 1.01 }}
          className="flex items-center gap-3 px-3 py-3 rounded-card bg-brand-surface shadow-soft mb-2 cursor-default"
        >
          <div className="w-9 h-9 bg-gradient-primary rounded-inner flex items-center justify-center flex-shrink-0 shadow-pill">
            <span className="text-white font-bold text-xs">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brand-text truncate">{profile?.full_name ?? 'Admin'}</p>
            <p className="text-[11px] text-brand-muted font-medium">Administrator</p>
          </div>
        </motion.div>

        {/* System health indicator */}
        <div className="mb-1">
          <HealthStatusChip />
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-full text-sm font-medium text-brand-muted hover:bg-negative/8 hover:text-negative transition-all duration-150 group"
        >
          <MdLogout className="w-[18px] h-[18px] group-hover:translate-x-0.5 transition-transform" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
