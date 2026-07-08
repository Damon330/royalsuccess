import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../context/ThemeContext'
import { MdPerson, MdSettings, MdSunny, MdNightlight } from 'react-icons/md'
import ProfilePage  from './ProfilePage'
import SettingsPage from './SettingsPage'

type Tab = 'profile' | 'settings'

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'profile',  label: 'Profile',  Icon: MdPerson   },
  { id: 'settings', label: 'Settings', Icon: MdSettings },
]

export default function AccountPage() {
  const { profile } = useAuth()
  const { toggleTheme, isDark } = useTheme()
  const [tab, setTab] = useState<Tab>('profile')

  const initials = (profile?.full_name ?? '?')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  return (
    <div className="flex flex-col min-h-screen bg-brand-bg">

      {/* Top bar */}
      <div className="bg-brand-surface border-b border-brand-border sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border/50">
          <div className="w-9 h-9 bg-gradient-primary rounded-inner flex items-center justify-center flex-shrink-0 shadow-pill">
            <span className="text-white font-extrabold text-sm">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brand-text truncate">{profile?.full_name}</p>
            <p className="text-xs text-brand-muted capitalize">{profile?.role?.replace('_', ' ')}</p>
          </div>
          {/* Quick theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-inner flex items-center justify-center text-brand-muted hover:text-brand-text hover:bg-primary/8 transition-all"
          >
            {isDark
              ? <MdSunny className="w-5 h-5 text-amber-400" />
              : <MdNightlight className="w-4.5 h-4.5" />
            }
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex relative">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-all duration-150 relative ${
                tab === id ? 'text-primary' : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {tab === id && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <motion.div
        key={tab}
        initial={{ opacity: 0, x: tab === 'settings' ? 20 : -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="flex-1"
      >
        {tab === 'profile'  && <ProfilePage  standalone={false} />}
        {tab === 'settings' && <SettingsPage standalone={false} />}
      </motion.div>

    </div>
  )
}
