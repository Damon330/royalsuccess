import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../context/ThemeContext'
import NotificationBell from './NotificationBell'
import toast from 'react-hot-toast'
import {
  MdSunny, MdNightlight, MdSettings, MdPerson,
  MdLogout, MdChevronRight, MdShield,
} from 'react-icons/md'

interface HeaderProps {
  title:     string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { profile, session, signOut } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const initials = (profile?.full_name ?? '?')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  const roleLabel: Record<string, string> = {
    admin:     'Administrator',
    team_lead: 'Team Lead',
    agent:     'Agent',
  }

  const profilePath  = profile?.role === 'admin' ? '/admin/profile'  : profile?.role === 'team_lead' ? '/teamlead/account' : '/agent/account'
  const settingsPath = profile?.role === 'admin' ? '/admin/settings' : profile?.role === 'team_lead' ? '/teamlead/account' : '/agent/account'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    setDropdownOpen(false)
    await signOut()
    toast.success('Signed out successfully.')
    navigate('/login')
  }

  return (
    <header className="
      bg-brand-surface/90 glass border-b border-brand-border
      px-4 sm:px-6 py-3.5 flex items-center justify-between
      sticky top-0 z-20
      transition-colors duration-200
    ">
      {/* Left: title + breadcrumb */}
      <div>
        {subtitle && (
          <p className="text-[11px] text-brand-muted font-medium uppercase tracking-widest mb-0.5 hidden sm:block">
            {subtitle}
          </p>
        )}
        <h1 className="text-lg font-extrabold text-brand-text leading-tight">{title}</h1>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="
            w-9 h-9 rounded-xl flex items-center justify-center
            text-brand-muted hover:text-brand-text
            bg-transparent hover:bg-brand-border/60
            transition-all duration-150
          "
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              exit={{ rotate: 30, opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.18 }}
              className="flex items-center justify-center"
            >
              {isDark
                ? <MdSunny    className="w-5 h-5 text-amber-400" />
                : <MdNightlight className="w-4.5 h-4.5" />
              }
            </motion.span>
          </AnimatePresence>
        </button>

        {/* Notifications */}
        <NotificationBell userId={session?.user.id} />

        {/* Settings quick-link */}
        <Link
          to={settingsPath}
          title="Settings"
          className="
            w-9 h-9 rounded-xl flex items-center justify-center
            text-brand-muted hover:text-brand-text
            hover:bg-brand-border/60
            transition-all duration-150
          "
        >
          <MdSettings className="w-5 h-5" />
        </Link>

        {/* Profile avatar + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="
              flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl
              hover:bg-brand-border/60 transition-all duration-150
              group
            "
            aria-expanded={dropdownOpen}
          >
            <div className="
              w-8 h-8 bg-primary rounded-xl flex items-center justify-center
              text-white font-bold text-xs flex-shrink-0
              group-hover:bg-primary-light transition-colors duration-150
              shadow-sm
            ">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-brand-text leading-none">{profile?.full_name ?? '—'}</p>
              <p className="text-[10px] text-brand-muted mt-0.5 capitalize">{roleLabel[profile?.role ?? ''] ?? profile?.role}</p>
            </div>
          </button>

          {/* Dropdown */}
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="
                  absolute right-0 top-full mt-2 w-64
                  bg-brand-surface border border-brand-border
                  rounded-2xl shadow-dropdown overflow-hidden
                  z-50
                "
              >
                {/* User info */}
                <div className="px-4 py-4 border-b border-brand-border bg-gradient-to-br from-primary/5 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-primary rounded-2xl flex items-center justify-center text-white font-extrabold text-sm flex-shrink-0 shadow-sm">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-brand-text text-sm truncate">{profile?.full_name}</p>
                      <p className="text-xs text-brand-muted truncate mt-0.5">{session?.user.email}</p>
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        <MdShield className="w-3 h-3" />
                        {roleLabel[profile?.role ?? ''] ?? profile?.role}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1.5">
                  <DropdownItem
                    icon={<MdPerson className="w-4 h-4" />}
                    label="View Profile"
                    to={profilePath}
                    onClick={() => setDropdownOpen(false)}
                  />
                  <DropdownItem
                    icon={<MdSettings className="w-4 h-4" />}
                    label="Settings"
                    to={settingsPath}
                    onClick={() => setDropdownOpen(false)}
                  />
                </div>

                <div className="py-1.5 border-t border-brand-border">
                  <button
                    onClick={handleSignOut}
                    className="
                      w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium
                      text-danger hover:bg-danger/8 transition-colors duration-150
                      group
                    "
                  >
                    <MdLogout className="w-4 h-4 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </header>
  )
}

function DropdownItem({ icon, label, to, onClick }: {
  icon:    React.ReactNode
  label:   string
  to:      string
  onClick: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="
        flex items-center gap-3 px-4 py-2.5 text-sm font-medium
        text-brand-text hover:bg-brand-border/50 hover:text-primary
        transition-colors duration-150 group
      "
    >
      <span className="text-brand-muted group-hover:text-primary transition-colors">{icon}</span>
      <span className="flex-1">{label}</span>
      <MdChevronRight className="w-4 h-4 text-brand-muted/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </Link>
  )
}
