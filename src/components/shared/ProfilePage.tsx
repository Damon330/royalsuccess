import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Header from './Header'
import Button from './Button'
import toast from 'react-hot-toast'
import {
  MdPerson, MdPhone, MdEmail, MdCalendarToday,
  MdEdit, MdSave, MdCancel, MdTrendingUp,
  MdPhoneAndroid, MdGroup, MdCheckCircle, MdVerified,
} from 'react-icons/md'

const ROLE_LABELS: Record<string, string> = {
  admin:     'Administrator',
  team_lead: 'Team Lead',
  agent:     'Field Agent',
}

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin:     { bg: 'bg-white/25',         text: 'text-white'        },
  team_lead: { bg: 'bg-blue-500/20',      text: 'text-blue-200'     },
  agent:     { bg: 'bg-white/15',         text: 'text-white/80'     },
}

interface Stats {
  unitsSoldThisMonth: number
  totalUnitsSold:     number
  teamSize?:          number
  activePhones?:      number
}

async function fetchStats(profileId: string, role: string): Promise<Stats | null> {
  if (role === 'admin') return null

  const now        = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [monthRes, totalRes] = await Promise.all([
    supabase.from('sales').select('id', { count: 'exact', head: true })
      .eq('sold_by', profileId).gte('sold_at', `${monthStart}T00:00:00`),
    supabase.from('sales').select('id', { count: 'exact', head: true })
      .eq('sold_by', profileId),
  ])

  if (role === 'team_lead') {
    const { count: teamSize }    = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('team_lead_id', profileId).eq('status', 'active')
    const { count: activePhones } = await supabase.from('phones').select('id', { count: 'exact', head: true }).eq('assigned_to', profileId).eq('status', 'assigned')
    return { unitsSoldThisMonth: monthRes.count ?? 0, totalUnitsSold: totalRes.count ?? 0, teamSize: teamSize ?? 0, activePhones: activePhones ?? 0 }
  }

  return { unitsSoldThisMonth: monthRes.count ?? 0, totalUnitsSold: totalRes.count ?? 0 }
}

function fadeUp(delay = 0) {
  return {
    initial:    { opacity: 0, y: 16 },
    animate:    { opacity: 1, y: 0 },
    transition: { delay, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const },
  } as const
}

export default function ProfilePage({ standalone = true }: { standalone?: boolean }) {
  const { profile, session, updateProfileState, refreshProfile } = useAuth()
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
    try {
      const { error } = await supabase.from('profiles')
        .update({ full_name: fullName.trim(), phone_number: phone.trim() || null })
        .eq('id', profile.id)
      if (error) {
        toast.error(`Save failed: ${error.message}`)
        return
      }
      updateProfileState({ full_name: fullName.trim(), phone_number: phone.trim() || null })
      setEditing(false)
      toast.success('Profile saved.')
      await refreshProfile()
    } catch (err) {
      toast.error('Unexpected error — check connection.')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setEditing(false)
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone_number ?? '')
  }

  const initials = (profile?.full_name ?? '?')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const roleColor = ROLE_COLORS[profile?.role ?? 'agent']

  return (
    <div className="flex-1 overflow-y-auto bg-brand-bg">
      {standalone && <Header title="Profile" subtitle="Account" />}

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">

        {/* Hero banner */}
        <motion.div
          {...fadeUp(0)}
          className="relative bg-gradient-banner rounded-card p-8 text-center text-white shadow-card overflow-hidden"
        >
          {/* Decorative blobs */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-1 bg-white/20 rounded-full" />

          {/* Avatar */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4, type: 'spring', stiffness: 200 }}
            className="w-24 h-24 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4 border-2 border-white/30 shadow-lg"
          >
            <span className="text-3xl font-extrabold tracking-tight">{initials}</span>
          </motion.div>

          <h2 className="text-2xl font-extrabold tracking-tight">{profile?.full_name}</h2>
          <p className="text-white/60 text-sm mt-1 font-medium">{session?.user.email}</p>

          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${roleColor.bg} ${roleColor.text}`}>
              <MdVerified className="w-3.5 h-3.5" />
              {ROLE_LABELS[profile?.role ?? 'agent']}
            </span>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              profile?.status === 'active'
                ? 'bg-green-400/20 text-green-300'
                : 'bg-amber-400/20 text-amber-300'
            }`}>
              {profile?.status === 'active' ? '● Active' : '● Pending'}
            </span>
          </div>
        </motion.div>

        {/* Stats */}
        {stats && (
          <motion.div
            {...fadeUp(0.1)}
            className={`grid gap-3 ${profile?.role === 'team_lead' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}
          >
            {[
              { Icon: MdTrendingUp,  color: 'text-primary',    bg: 'bg-primary/10  dark:bg-primary/20',  border: 'border-l-primary',     label: 'This Month', value: stats.unitsSoldThisMonth, sub: 'units sold'     },
              { Icon: MdCheckCircle, color: 'text-blue-600',   bg: 'bg-blue-50     dark:bg-blue-900/20', border: 'border-l-blue-500',    label: 'All Time',   value: stats.totalUnitsSold,     sub: 'total units'    },
              ...(profile?.role === 'team_lead' && stats.teamSize !== undefined
                ? [{ Icon: MdGroup,       color: 'text-orange-500', bg: 'bg-orange-50   dark:bg-orange-900/20', border: 'border-l-orange-400', label: 'Team Size',  value: stats.teamSize,           sub: 'active agents'  }] : []),
              ...(profile?.role === 'team_lead' && stats.activePhones !== undefined
                ? [{ Icon: MdPhoneAndroid, color: 'text-green-600',  bg: 'bg-green-50    dark:bg-green-900/20',  border: 'border-l-green-500', label: 'Phones',     value: stats.activePhones,       sub: 'in hand'        }] : []),
            ].map(({ Icon, color, bg, border, label, value, sub }) => (
              <div key={label} className={`bg-brand-surface border border-brand-border ${border} border-l-4 rounded-card p-4 shadow-card`}>
                <div className={`w-8 h-8 ${bg} rounded-inner flex items-center justify-center mb-2`}>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className="text-2xl font-extrabold text-brand-text tabular-nums">{value}</p>
                <p className="text-xs font-bold text-brand-muted uppercase tracking-wide mt-0.5">{label}</p>
                <p className="text-xs text-brand-muted">{sub}</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Personal info card */}
        <motion.div
          {...fadeUp(0.2)}
          className="bg-brand-surface border border-brand-border rounded-card overflow-hidden shadow-card"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary/10 dark:bg-primary/20 rounded-xl flex items-center justify-center">
                <MdPerson className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-brand-text text-sm">Personal Information</h3>
                <p className="text-xs text-brand-muted">Manage your profile details</p>
              </div>
            </div>
            {!editing && (
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30 px-3 py-1.5 rounded-xl transition-colors"
              >
                <MdEdit className="w-3.5 h-3.5" /> Edit Profile
              </motion.button>
            )}
          </div>

          <div className="p-5 space-y-5">
            {/* Full Name */}
            <Field
              label="Full Name"
              icon={<MdPerson className="w-3.5 h-3.5" />}
              editing={editing}
            >
              {editing
                ? <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-base" />
                : <p className="text-sm font-semibold text-brand-text">{profile?.full_name}</p>
              }
            </Field>

            {/* Email */}
            <Field label="Email Address" icon={<MdEmail className="w-3.5 h-3.5" />} editing={false}>
              <p className="text-sm text-brand-muted">{session?.user.email}</p>
              <p className="text-xs text-brand-muted/60 mt-0.5">Email cannot be changed here.</p>
            </Field>

            {/* Phone */}
            <Field label="Phone Number" icon={<MdPhone className="w-3.5 h-3.5" />} editing={editing}>
              {editing
                ? <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 XXX XXX XXXX" type="tel" className="input-base" />
                : <p className="text-sm font-semibold text-brand-text">{profile?.phone_number ?? <span className="text-brand-muted italic font-normal">Not set</span>}</p>
              }
            </Field>

            {/* Member since */}
            <Field label="Member Since" icon={<MdCalendarToday className="w-3.5 h-3.5" />} editing={false}>
              <p className="text-sm text-brand-muted">{memberSince}</p>
            </Field>

            {editing && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 pt-1"
              >
                <Button variant="secondary" onClick={handleCancel} fullWidth>
                  <MdCancel className="w-4 h-4" /> Cancel
                </Button>
                <Button onClick={handleSave} loading={saving} disabled={!fullName.trim()} fullWidth>
                  <MdSave className="w-4 h-4" /> Save Changes
                </Button>
              </motion.div>
            )}
          </div>
        </motion.div>

      </div>
    </div>
  )
}

function Field({ label, icon, editing: _editing, children }: {
  label:    string
  icon:     React.ReactNode
  editing:  boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[11px] font-bold text-brand-muted uppercase tracking-wider mb-2">
        <span className="text-brand-muted">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  )
}
