import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { MdPerson, MdSettings } from 'react-icons/md'
import ProfilePage from './ProfilePage'
import SettingsPage from './SettingsPage'

type Tab = 'profile' | 'settings'

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'profile',  label: 'Profile',  Icon: MdPerson   },
  { id: 'settings', label: 'Settings', Icon: MdSettings },
]

export default function AccountPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('profile')

  const initials = (profile?.full_name ?? '?')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  return (
    <div className="flex flex-col">

      {/* Compact top header */}
      <div className="bg-white border-b border-brand-border sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border/50">
          <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white font-extrabold text-sm">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brand-text truncate">{profile?.full_name}</p>
            <p className="text-xs text-brand-muted capitalize">{profile?.role?.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold border-b-2 transition-all duration-150 ${
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-brand-muted hover:text-brand-text'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Page content — standalone=false skips the internal Header */}
      {tab === 'profile'  && <ProfilePage  standalone={false} />}
      {tab === 'settings' && <SettingsPage standalone={false} />}

    </div>
  )
}
