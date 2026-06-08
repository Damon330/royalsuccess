import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useReturns } from '../../hooks/useReturns'
import toast from 'react-hot-toast'
import {
  MdDashboard, MdInventory2, MdPeople, MdPhoneAndroid,
  MdBarChart, MdLogout, MdUndo, MdHistory, MdReceipt,
} from 'react-icons/md'

const staticNavItems = [
  { path: '/admin/dashboard', label: 'Dashboard',    icon: MdDashboard  },
  { path: '/admin/inventory', label: 'Inventory',    icon: MdInventory2 },
  { path: '/admin/agents',    label: 'Agents',       icon: MdPeople     },
  { path: '/admin/assign',    label: 'Assign Phones',icon: MdPhoneAndroid},
  { path: '/admin/reports',   label: 'Reports',      icon: MdBarChart   },
]

export default function Sidebar() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const { pendingCount } = useReturns(undefined, 'sidebar')

  async function handleSignOut() {
    await signOut()
    toast.success('Signed out successfully.')
    navigate('/login')
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-primary text-white">
      <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
        <div className="bg-white/20 rounded-xl p-2"><MdPhoneAndroid className="w-6 h-6 text-white" /></div>
        <div>
          <p className="font-bold text-lg leading-tight">Royal</p>
          <p className="font-bold text-lg leading-tight text-green-200">Success</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {staticNavItems.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${isActive ? 'bg-white/20 text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        {/* Returns — with pending badge */}
        <NavLink to="/admin/returns"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
            ${isActive ? 'bg-white/20 text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
          }
        >
          <MdUndo className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">Returns</span>
          {pendingCount > 0 && (
            <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </NavLink>

        {/* Receipts */}
        <NavLink to="/admin/receipts"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
            ${isActive ? 'bg-white/20 text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
          }
        >
          <MdReceipt className="w-5 h-5 flex-shrink-0" />
          Receipts
        </NavLink>

        {/* Activity feed */}
        <NavLink to="/admin/activity"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
            ${isActive ? 'bg-white/20 text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
          }
        >
          <MdHistory className="w-5 h-5 flex-shrink-0" />
          Activity
        </NavLink>
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <div className="px-4 py-3 mb-2">
          <p className="text-xs text-white/50 uppercase tracking-wider font-medium">Signed in as</p>
          <p className="text-sm text-white font-medium truncate mt-0.5">{profile?.full_name ?? 'Admin'}</p>
        </div>
        <button onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all duration-150 w-full">
          <MdLogout className="w-5 h-5" /> Sign Out
        </button>
      </div>
    </aside>
  )
}
