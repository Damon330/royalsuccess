import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../context/ThemeContext'
import NotificationBell from './NotificationBell'
import toast from 'react-hot-toast'
import {
  MdSunny, MdNightlight, MdSettings, MdPerson,
  MdLogout, MdChevronRight, MdShield, MdSearch,
  MdGridView,
} from 'react-icons/md'

interface HeaderProps {
  title:     string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { profile, session, signOut } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()
  const navigate = useNavigate()
  const [dropdownOpen,  setDropdownOpen]  = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const searchRef    = useRef<HTMLInputElement>(null)

  const initials = (profile?.full_name ?? '?')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  const roleLabel: Record<string, string> = {
    admin:     'Administrator',
    team_lead: 'Team Lead',
    agent:     'Field Agent',
  }

  const profilePath  = profile?.role === 'admin' ? '/admin/profile'  : '/account'
  const settingsPath = profile?.role === 'admin' ? '/admin/settings' : '/account'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (searchVisible) searchRef.current?.focus()
  }, [searchVisible])

  async function handleSignOut() {
    setDropdownOpen(false)
    await signOut()
    toast.success('Signed out.')
    navigate('/login')
  }

  return (
    <header className="
      bg-brand-surface/90 glass border-b border-brand-border
      px-4 sm:px-6 py-3 flex items-center gap-3
      sticky top-0 z-20 transition-colors duration-200
    ">
      {/* Breadcrumb + title */}
      <div className="flex-1 min-w-0">
        {subtitle && (
          <div className="flex items-center gap-1.5 text-[11px] text-brand-muted mb-0.5">
            <span className="opacity-60">⌂</span>
            <span>{subtitle}</span>
          </div>
        )}
        <h1 className="text-lg font-extrabold text-brand-text leading-tight truncate">{title}</h1>
      </div>

      {/* Search bar (expands from icon) */}
      <AnimatePresence>
        {searchVisible && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <input
              ref={searchRef}
              onBlur={() => setSearchVisible(false)}
              placeholder="Search…"
              className="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right icon strip — matches eCommUIUX order */}
      <div className="flex items-center gap-1">

        {/* Search */}
        <IconBtn title="Search" onClick={() => setSearchVisible((v) => !v)}>
          <MdSearch className="w-[18px] h-[18px]" />
        </IconBtn>

        {/* Theme toggle */}
        <IconBtn title={isDark ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -30, opacity: 0, scale: 0.7 }}
              animate={{ rotate: 0,   opacity: 1, scale: 1 }}
              exit={{ rotate: 30,    opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.18 }}
              className="flex items-center justify-center"
            >
              {isDark
                ? <MdSunny      className="w-[18px] h-[18px] text-amber-400" />
                : <MdNightlight className="w-[18px] h-[18px]" />
              }
            </motion.span>
          </AnimatePresence>
        </IconBtn>

        {/* Grid / layout shortcut */}
        <IconBtn title="Grid view" onClick={() => navigate(profile?.role === 'admin' ? '/admin/inventory' : '/')}>
          <MdGridView className="w-[18px] h-[18px]" />
        </IconBtn>

        {/* Notifications */}
        <NotificationBell userId={session?.user.id} />

        {/* Divider */}
        <div className="w-px h-6 bg-brand-border mx-1" />

        {/* Profile dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-brand-border/50 transition-all duration-150 group"
            aria-expanded={dropdownOpen}
          >
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-pill group-hover:bg-primary-light transition-colors">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-extrabold text-brand-text leading-none">{profile?.full_name ?? '—'}</p>
              <p className="text-[10px] text-brand-muted mt-0.5 capitalize font-medium">
                {roleLabel[profile?.role ?? ''] ?? profile?.role}
              </p>
            </div>
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0,  scale: 1 }}
                exit={{ opacity: 0,    y: -8, scale: 0.96 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="
                  absolute right-0 top-full mt-2 w-64
                  bg-brand-surface border border-brand-border
                  rounded-2xl overflow-hidden z-50
                "
                style={{ boxShadow: '0 12px 28px -6px rgba(0,0,0,0.14),0 6px 12px -6px rgba(0,0,0,0.08)' }}
              >
                {/* User info header */}
                <div className="px-4 py-4 border-b border-brand-border bg-gradient-to-br from-primary/8 to-transparent dark:from-primary/15">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-primary rounded-2xl flex items-center justify-center text-white font-extrabold text-sm flex-shrink-0 shadow-pill">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-brand-text text-sm truncate">{profile?.full_name}</p>
                      <p className="text-xs text-brand-muted truncate mt-0.5">{session?.user.email}</p>
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-primary bg-primary/12 dark:bg-primary/20 px-2 py-0.5 rounded-full">
                        <MdShield className="w-3 h-3" />
                        {roleLabel[profile?.role ?? ''] ?? profile?.role}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Links */}
                <div className="py-1.5">
                  <DropdownLink icon={<MdPerson className="w-4 h-4" />}   label="View Profile" to={profilePath}  close={() => setDropdownOpen(false)} />
                  <DropdownLink icon={<MdSettings className="w-4 h-4" />} label="Settings"     to={settingsPath} close={() => setDropdownOpen(false)} />
                </div>

                <div className="py-1.5 border-t border-brand-border">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/8 transition-colors group"
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

function IconBtn({ title, onClick, children }: {
  title:    string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-9 h-9 rounded-xl flex items-center justify-center text-brand-muted hover:text-brand-text hover:bg-brand-border/60 transition-all duration-150"
    >
      {children}
    </button>
  )
}

function DropdownLink({ icon, label, to, close }: {
  icon:  React.ReactNode
  label: string
  to:    string
  close: () => void
}) {
  return (
    <Link
      to={to}
      onClick={close}
      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-brand-text hover:bg-brand-border/50 hover:text-primary transition-colors group"
    >
      <span className="text-brand-muted group-hover:text-primary transition-colors">{icon}</span>
      <span className="flex-1">{label}</span>
      <MdChevronRight className="w-4 h-4 text-brand-muted/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </Link>
  )
}
