import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Header from './Header'
import Button from './Button'
import toast from 'react-hot-toast'
import {
  MdPerson, MdPhone, MdEmail, MdCalendarToday,
  MdEdit, MdSave, MdCancel, MdTrendingUp,
  MdPhoneAndroid, MdGroup, MdCheckCircle,
} from 'react-icons/md'

const ROLE_LABELS: Record<string, string> = {
  admin:     'Administrator',
  team_lead: 'Team Lead',
  agent:     'Agent',
}

interface Stats {
  unitsSoldThisMonth: number
  totalUnitsSold:     number
  teamSize?:          number
  activePhones?:      number
}

async function fetchStats(profileId: string, role: string): Promise<Stats | null> {
  if (role === 'admin') return null

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [monthRes, totalRes] = await Promise.all([
    supabase.from('sales').select('id', { count: 'exact', head: true })
      .eq('sold_by', profileId)
      .gte('sold_at', `${monthStart}T00:00:00`),
    supabase.from('sales').select('id', { count: 'exact', head: true })
      .eq('sold_by', profileId),
  ])

  if (role === 'team_lead') {
    const { count: teamSize } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('team_lead_id', profileId)
      .eq('status', 'active')

    const { count: activePhones } = await supabase
      .from('phones')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', profileId)
      .eq('status', 'assigned')

    return {
      unitsSoldThisMonth: monthRes.count ?? 0,
      totalUnitsSold:     totalRes.count ?? 0,
      teamSize:           teamSize ?? 0,
      activePhones:       activePhones ?? 0,
    }
  }

  return {
    unitsSoldThisMonth: monthRes.count ?? 0,
    totalUnitsSold:     totalRes.count ?? 0,
  }
}

export default function ProfilePage({ standalone = true }: { standalone?: boolean }) {
  const { profile, session, updateProfileState } = useAuth()
  const [editing,  setEditing]  = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone,    setPhone]    = useState(profile?.phone_number ?? '')
  const [saving,   setSaving]   = useState(false)
  const [stats,    setStats]    = useState<Stats | null>(null)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name)
      setPhone(profile.phone_number ?? '')
      fetchStats(profile.id, profile.role).then(setStats).catch(() => {})
    }
  }, [profile])

  async function handleSave() {
    if (!profile || !fullName.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), phone_number: phone.trim() || null })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      toast.error('Failed to update profile.')
      return
    }
    updateProfileState({ full_name: fullName.trim(), phone_number: phone.trim() || null })
    toast.success('Profile updated.')
    setEditing(false)
  }

  function handleCancel() {
    setEditing(false)
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone_number ?? '')
  }

  const initials = (profile?.full_name ?? '?')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-NG', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'

  return (
    <div className="flex-1 overflow-y-auto">
      {standalone && <Header title="Profile" />}

      <div className="max-w-2xl mx-auto p-6 space-y-5">

        {/* Hero banner */}
        <div className="bg-gradient-to-br from-primary to-primary-light rounded-2xl p-8 text-center text-white shadow-md">
          <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white/30 shadow-inner">
            <span className="text-3xl font-extrabold tracking-tight">{initials}</span>
          </div>
          <h2 className="text-2xl font-extrabold">{profile?.full_name}</h2>
          <p className="text-white/70 text-sm mt-1">{session?.user.email}</p>
          <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
            <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full capitalize">
              {ROLE_LABELS[profile?.role ?? 'agent']}
            </span>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              profile?.status === 'active'
                ? 'bg-green-400/25 text-white'
                : 'bg-amber-400/25 text-white'
            }`}>
              {profile?.status === 'active' ? '● Active' : '● Pending'}
            </span>
          </div>
        </div>

        {/* Stats — agents + team leads */}
        {stats && (
          <div className={`grid gap-3 ${profile?.role === 'team_lead' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
            <div className="bg-white border border-brand-border border-l-4 border-l-primary rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <MdTrendingUp className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide">This Month</p>
              </div>
              <p className="text-2xl font-extrabold text-primary tabular-nums">{stats.unitsSoldThisMonth}</p>
              <p className="text-xs text-brand-muted mt-0.5">units sold</p>
            </div>

            <div className="bg-white border border-brand-border border-l-4 border-l-blue-400 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <MdCheckCircle className="w-4 h-4 text-blue-500" />
                <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide">All Time</p>
              </div>
              <p className="text-2xl font-extrabold text-blue-700 tabular-nums">{stats.totalUnitsSold}</p>
              <p className="text-xs text-brand-muted mt-0.5">total units sold</p>
            </div>

            {profile?.role === 'team_lead' && stats.teamSize !== undefined && (
              <div className="bg-white border border-brand-border border-l-4 border-l-orange-400 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <MdGroup className="w-4 h-4 text-orange-500" />
                  <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide">Team Size</p>
                </div>
                <p className="text-2xl font-extrabold text-orange-600 tabular-nums">{stats.teamSize}</p>
                <p className="text-xs text-brand-muted mt-0.5">active agents</p>
              </div>
            )}

            {profile?.role === 'team_lead' && stats.activePhones !== undefined && (
              <div className="bg-white border border-brand-border border-l-4 border-l-green-500 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <MdPhoneAndroid className="w-4 h-4 text-green-600" />
                  <p className="text-xs font-semibold text-brand-muted uppercase tracking-wide">Stock</p>
                </div>
                <p className="text-2xl font-extrabold text-green-700 tabular-nums">{stats.activePhones}</p>
                <p className="text-xs text-brand-muted mt-0.5">phones in hand</p>
              </div>
            )}
          </div>
        )}

        {/* Personal info */}
        <div className="bg-white border border-brand-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border">
            <div className="flex items-center gap-2">
              <MdPerson className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-brand-text">Personal Information</h3>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-light transition-colors"
              >
                <MdEdit className="w-4 h-4" /> Edit
              </button>
            )}
          </div>

          <div className="p-5 space-y-5">
            {/* Full name */}
            <div>
              <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                Full Name
              </label>
              {editing ? (
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ) : (
                <p className="text-sm font-semibold text-brand-text">{profile?.full_name}</p>
              )}
            </div>

            {/* Email — always read-only */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                <MdEmail className="w-3.5 h-3.5" /> Email Address
              </label>
              <p className="text-sm text-brand-muted">{session?.user.email}</p>
              <p className="text-xs text-brand-muted/60 mt-0.5">Email cannot be changed here.</p>
            </div>

            {/* Phone number */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                <MdPhone className="w-3.5 h-3.5" /> Phone Number
              </label>
              {editing ? (
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+234 XXX XXX XXXX"
                  type="tel"
                  className="w-full border border-brand-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ) : (
                <p className="text-sm font-semibold text-brand-text">
                  {profile?.phone_number ?? <span className="text-brand-muted italic font-normal">Not set</span>}
                </p>
              )}
            </div>

            {/* Member since */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">
                <MdCalendarToday className="w-3.5 h-3.5" /> Member Since
              </label>
              <p className="text-sm text-brand-muted">{memberSince}</p>
            </div>

            {editing && (
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={handleCancel} fullWidth>
                  <MdCancel className="w-4 h-4" /> Cancel
                </Button>
                <Button onClick={handleSave} loading={saving} disabled={!fullName.trim()} fullWidth>
                  <MdSave className="w-4 h-4" /> Save Changes
                </Button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
