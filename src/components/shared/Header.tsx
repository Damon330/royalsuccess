import { useAuth } from '../../hooks/useAuth'
import NotificationBell from './NotificationBell'

interface HeaderProps { title: string }

export default function Header({ title }: HeaderProps) {
  const { profile, session } = useAuth()

  return (
    <header className="bg-white border-b border-brand-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <h1 className="text-xl font-bold text-brand-text">{title}</h1>
      <div className="flex items-center gap-3">
        <NotificationBell userId={session?.user.id} />
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-brand-text">{profile?.full_name}</p>
          <p className="text-xs text-brand-muted capitalize">{profile?.role?.replace('_', ' ')}</p>
        </div>
        <div className="bg-primary rounded-full h-9 w-9 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
        </div>
      </div>
    </header>
  )
}
