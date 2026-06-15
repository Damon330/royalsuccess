import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../context/ThemeContext'
import NotificationBell from './NotificationBell'
import toast from 'react-hot-toast'
import {
  MdSunny, MdNightlight, MdSettings, MdPerson,
  MdLogout, MdChevronRight, MdSearch, MdGridView,
  MdVerified,
} from 'react-icons/md'

interface HeaderProps {
  title:     string
  subtitle?: string
}

const ROLE_LABELS: Record<string, string> = {
  admin:     'Administrator',
  team_lead: 'Team Lead',
  agent:     'Field Agent',
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { profile, session, signOut } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()
  const navigate = useNavigate()
  const [dropdownOpen,  setDropdownOpen]  = useState(false)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef   = useRef<HTMLInputElement>(null)

  const initials = (profile?.full_name ?? '?')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  const profilePath  = profile?.role === 'admin' ? '/admin/profile'  : '/account'
  const settingsPath = profile?.role === 'admin' ? '/admin/settings' : '/account'

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  async function handleSignOut() {
    setDropdownOpen(false)
    await signOut()
    toast.success('Signed out.')
    navigate('/login')
  }

  return (
    <header className="
      bg-brand-surface/80 glass border-b border-brand-border/60
      px-4 sm:px-6 py-3.5 flex items-center gap-4
      sticky top-0 z-20 transition-colors duration-200
    ">

      {/* Left: breadcrumb + title */}
      <div className="flex-1 min-w-0">
        {subtitle && (
          <div className="flex items-center gap-1.5 section-label mb-0.5">
            <span>⌂</span><span>{subtitle}</span>
          </div>
        )}
        <h1 className="text-lg font-extrabold text-brand-text leading-tight truncate">{title}</h1>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }} animate={{ width: 200, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <input
              ref={searchRef}
              onBlur={() => setSearchOpen(false)}
              placeholder="Search…"
              className="w-full bg-brand-bg border border-brand-border rounded-full px-4 py-2 text-sm text-brand-text placeholder:text-brand-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right: icon strip */}
      <div className="flex items-center gap-1">

        <HdrBtn title="Search" onClick={() => setSearchOpen(v => !v)}>
          <MdSearch className="w-[18px] h-[18px]" />
        </HdrBtn>

        <HdrBtn title={isDark ? 'Light mode' : 'Dark mode'} onClick={toggleTheme}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={theme}
              initial={{ rotate: -30, opacity: 0, scale: 0.7 }}
              animate={{ rotate: 0,   opacity: 1, scale: 1   }}
              exit={{    rotate: 30,  opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.18 }}
              className="flex items-center justify-center"
            >
              {isDark
                ? <MdSunny      className="w-[18px] h-[18px] text-amber-400" />
                : <MdNightlight className="w-[18px] h-[18px]" />
              }
            </motion.span>
          </AnimatePresence>
        </HdrBtn>

        <HdrBtn title="Inventory" onClick={() => navigate(profile?.role === 'admin' ? '/admin/inventory' : '/')}>
          <MdGridView className="w-[18px] h-[18px]" />
        </HdrBtn>

        <NotificationBell userId={session?.user.id} />

        {/* Divider */}
        <div className="w-px h-5 bg-brand-border mx-1.5 rounded-full" />

        {/* Profile dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-full hover:bg-primary/8 dark:hover:bg-primary/12 transition-all duration-150 group"
          >
            <div className="w-8 h-8 bg-gradient-primary rounded-inner flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-pill">
              {initials}
            </div>
            <div className="hidden sm:block text-left leading-none">
              <p className="text-xs font-bold text-brand-text">{profile?.full_name ?? '—'}</p>
              <p className="text-[10px] text-brand-muted mt-0.5 capitalize">{ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}</p>
            </div>
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0,  scale: 1    }}
                exit={{ opacity: 0,    y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-64 bg-brand-surface rounded-card overflow-hidden z-50"
                style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.1), 0 4px 10px rgba(0,0,0,0.05)' }}
              >
                {/* User info */}
                <div className="px-4 py-4 bg-gradient-to-br from-primary/8 to-transparent border-b border-brand-border">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-primary rounded-card flex items-center justify-center text-white font-extrabold text-sm flex-shrink-0 shadow-pill">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-brand-text text-sm truncate">{profile?.full_name}</p>
                      <p className="text-xs text-brand-muted truncate mt-0.5">{session?.user.email}</p>
                      <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                        <MdVerified className="w-3 h-3" />
                        {ROLE_LABELS[profile?.role ?? ''] ?? profile?.role}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Links */}
                <div className="py-1.5 px-1.5 space-y-0.5">
                  <DdItem icon={<MdPerson   className="w-4 h-4" />} label="View Profile" to={profilePath}  close={() => setDropdownOpen(false)} />
                  <DdItem icon={<MdSettings className="w-4 h-4" />} label="Settings"     to={settingsPath} close={() => setDropdownOpen(false)} />
                </div>

                <div className="py-1.5 px-1.5 border-t border-brand-border">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-negative rounded-inner hover:bg-negative/8 transition-colors group"
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

function HdrBtn({ title, onClick, children }: {
  title:    string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={title} onClick={onClick}
      className="w-9 h-9 rounded-inner flex items-center justify-center text-brand-muted hover:text-brand-text hover:bg-primary/8 dark:hover:bg-primary/12 transition-all duration-150"
    >
      {children}
    </button>
  )
}

function DdItem({ icon, label, to, close }: {
  icon:  React.ReactNode
  label: string
  to:    string
  close: () => void
}) {
  return (
    <Link
      to={to} onClick={close}
      className="flex items-center gap-3 px-3 py-2.5 rounded-inner text-sm font-medium text-brand-text hover:bg-primary/8 hover:text-primary dark:hover:bg-primary/12 transition-colors group"
    >
      <span className="text-brand-muted group-hover:text-primary transition-colors">{icon}</span>
      <span className="flex-1">{label}</span>
      <MdChevronRight className="w-4 h-4 text-brand-muted/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </Link>
  )
}
