import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../context/ThemeContext'
import Header from './Header'
import Button from './Button'
import toast from 'react-hot-toast'
import {
  MdLock, MdVisibility, MdVisibilityOff,
  MdLogout, MdCheckCircle, MdDevices, MdSecurity,
  MdInfo, MdSunny, MdNightlight, MdShield,
} from 'react-icons/md'

function PasswordInput({ value, onChange, placeholder, hasError }: {
  value:       string
  onChange:    (v: string) => void
  placeholder: string
  hasError?:   boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-base dark:bg-dark-surface dark:border-dark-border dark:text-slate-100 dark:placeholder:text-slate-500 pr-11 ${
          hasError ? 'border-danger focus:ring-danger' : ''
        }`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <MdVisibilityOff className="w-5 h-5" /> : <MdVisibility className="w-5 h-5" />}
      </button>
    </div>
  )
}

function fadeUp(delay = 0) {
  return {
    initial:    { opacity: 0, y: 14 },
    animate:    { opacity: 1, y: 0 },
    transition: { delay, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  } as const
}

export default function SettingsPage({ standalone = true }: { standalone?: boolean }) {
  const { session, signOut, profile } = useAuth()
  const { theme, toggleTheme, isDark } = useTheme()
  const navigate = useNavigate()

  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPw,        setSavingPw]        = useState(false)
  const [pwDone,          setPwDone]          = useState(false)
  const [signingOut,      setSigningOut]      = useState(false)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const tooShort = newPassword.length > 0 && newPassword.length < 8
  const canSave  = newPassword.length >= 8 && newPassword === confirmPassword

  // Password strength
  const strength = newPassword.length === 0 ? 0
    : newPassword.length < 8 ? 1
    : newPassword.length < 12 ? 2
    : /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^a-zA-Z0-9]/.test(newPassword) ? 4
    : 3

  const strengthLabel = ['', 'Weak', 'Fair', 'Strong', 'Very Strong'][strength]
  const strengthColor = ['', 'bg-red-500', 'bg-amber-400', 'bg-green-500', 'bg-emerald-400'][strength]

  async function handleChangePassword() {
    if (!canSave) return
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPw(false)
    if (error) { toast.error(`Could not update password: ${error.message}`); return }
    toast.success('Password updated successfully.')
    setNewPassword('')
    setConfirmPassword('')
    setPwDone(true)
    setTimeout(() => setPwDone(false), 4000)
  }

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/login')
  }

  const lastSignIn = session?.user.last_sign_in_at
    ? new Date(session.user.last_sign_in_at).toLocaleDateString('en-NG', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—'

  return (
    <div className="flex-1 overflow-y-auto bg-brand-bg">
      {standalone && <Header title="Settings" subtitle="Account" />}

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">

        {/* Appearance */}
        <motion.div {...fadeUp(0)}
          className="bg-brand-surface dark:bg-dark-card border border-brand-border rounded-2xl overflow-hidden shadow-card">
          <SectionHeader icon={<MdSunny className="w-4 h-4 text-amber-500" />} iconBg="bg-amber-50 dark:bg-amber-900/20" title="Appearance" sub="Choose your preferred theme" />
          <div className="p-5">
            <div className="flex items-center gap-4">
              <ThemeOption active={!isDark} icon={<MdSunny className="w-5 h-5 text-amber-500" />} label="Light" onClick={() => !isDark || toggleTheme()} />
              <ThemeOption active={isDark}  icon={<MdNightlight className="w-5 h-5 text-indigo-400" />} label="Dark"  onClick={() => isDark  || toggleTheme()} />
            </div>
            <p className="text-xs text-brand-muted mt-3">
              Active: <span className="font-semibold text-brand-text capitalize">{theme} mode</span> · Your preference is saved automatically.
            </p>
          </div>
        </motion.div>

        {/* Change Password */}
        <motion.div {...fadeUp(0.08)}
          className="bg-brand-surface dark:bg-dark-card border border-brand-border rounded-2xl overflow-hidden shadow-card">
          <SectionHeader icon={<MdLock className="w-4 h-4 text-primary" />} iconBg="bg-primary/10 dark:bg-primary/20" title="Change Password" sub="Use at least 8 characters" />

          <div className="p-5 space-y-4">
            <AnimatePresence>
              {pwDone && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl px-4 py-3"
                >
                  <MdCheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">Password updated successfully.</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">New Password</label>
              <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Enter new password" />
              {/* Strength bar */}
              {newPassword.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div key={level} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${level <= strength ? strengthColor : 'bg-brand-border'}`} />
                    ))}
                  </div>
                  <p className={`text-xs mt-1 font-semibold ${['', 'text-red-500', 'text-amber-500', 'text-green-600', 'text-emerald-500'][strength]}`}>
                    {strengthLabel}
                  </p>
                </motion.div>
              )}
              {tooShort && <p className="text-xs text-danger mt-1.5 font-medium">Must be at least 8 characters</p>}
            </div>

            <div>
              <label className="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-2">Confirm New Password</label>
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm new password" hasError={mismatch} />
              {mismatch && <p className="text-xs text-danger mt-1.5 font-medium">Passwords do not match</p>}
            </div>

            <Button onClick={handleChangePassword} loading={savingPw} disabled={!canSave} fullWidth>
              <MdLock className="w-4 h-4" /> Update Password
            </Button>
          </div>
        </motion.div>

        {/* Account info */}
        <motion.div {...fadeUp(0.16)}
          className="bg-brand-surface dark:bg-dark-card border border-brand-border rounded-2xl overflow-hidden shadow-card">
          <SectionHeader icon={<MdInfo className="w-4 h-4 text-blue-500" />} iconBg="bg-blue-50 dark:bg-blue-900/20" title="Account Details" sub="Your account information" />
          <div className="divide-y divide-brand-border">
            {[
              { label: 'Email',       value: session?.user.email ?? '—' },
              { label: 'Role',        value: profile?.role?.replace('_', ' ') ?? '—', cap: true },
              { label: 'Status',      value: profile?.status ?? '—',                  cap: true },
              { label: 'Last Sign In', value: lastSignIn },
            ].map(({ label, value, cap }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-brand-muted">{label}</span>
                <span className={`text-sm font-semibold text-brand-text ${cap ? 'capitalize' : ''}`}>{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Security tips */}
        <motion.div {...fadeUp(0.24)}
          className="bg-brand-surface dark:bg-dark-card border border-brand-border rounded-2xl overflow-hidden shadow-card">
          <SectionHeader icon={<MdSecurity className="w-4 h-4 text-primary" />} iconBg="bg-primary/10 dark:bg-primary/20" title="Security Tips" sub="Keep your account safe" />
          <div className="p-5 space-y-3">
            {[
              { icon: <MdShield className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />,  text: 'Use a unique password not shared with other services.' },
              { icon: <MdDevices className="w-4 h-4 text-brand-muted flex-shrink-0 mt-0.5" />, text: 'Never share your login — every user should have their own account.' },
              { icon: <MdLogout className="w-4 h-4 text-brand-muted flex-shrink-0 mt-0.5" />,  text: 'Log out from shared or public devices after each session.' },
            ].map(({ icon, text }) => (
              <div key={text} className="flex items-start gap-3 p-3 rounded-xl bg-brand-bg dark:bg-dark-bg/50">
                {icon}
                <p className="text-sm text-brand-muted leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Version + sign out */}
        <motion.div {...fadeUp(0.32)} className="space-y-3">
          <div className="bg-brand-surface dark:bg-dark-card border border-brand-border rounded-xl px-5 py-3 flex items-center justify-between shadow-card">
            <span className="text-sm text-brand-muted">App Version</span>
            <span className="text-sm font-semibold text-brand-text">1.0.0</span>
          </div>

          <div className="bg-brand-surface dark:bg-dark-card border border-brand-border rounded-2xl p-5 shadow-card">
            <Button variant="danger" onClick={handleSignOut} loading={signingOut} fullWidth size="lg">
              <MdLogout className="w-5 h-5" /> Sign Out
            </Button>
          </div>
        </motion.div>

      </div>
    </div>
  )
}

function SectionHeader({ icon, iconBg, title, sub }: {
  icon:   React.ReactNode
  iconBg: string
  title:  string
  sub:    string
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-border">
      <div className={`w-9 h-9 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-brand-text text-sm">{title}</h3>
        <p className="text-xs text-brand-muted">{sub}</p>
      </div>
    </div>
  )
}

function ThemeOption({ active, icon, label, onClick }: {
  active:  boolean
  icon:    React.ReactNode
  label:   string
  onClick: () => void
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 ${
        active
          ? 'border-primary bg-primary/8 dark:bg-primary/15'
          : 'border-brand-border bg-brand-bg dark:bg-dark-bg/50 hover:border-brand-muted/50'
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
        active ? 'bg-primary/15 dark:bg-primary/25' : 'bg-brand-border'
      }`}>
        {icon}
      </div>
      <span className={`text-xs font-bold transition-colors ${active ? 'text-primary' : 'text-brand-muted'}`}>{label}</span>
      {active && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}
    </motion.button>
  )
}
