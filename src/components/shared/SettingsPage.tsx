import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Header from './Header'
import Button from './Button'
import toast from 'react-hot-toast'
import {
  MdLock, MdVisibility, MdVisibilityOff,
  MdLogout, MdInfo, MdCheckCircle,
  MdDevices, MdSecurity,
} from 'react-icons/md'

function PasswordInput({ value, onChange, placeholder }: {
  value:       string
  onChange:    (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-brand-border rounded-xl px-3 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text transition-colors"
        tabIndex={-1}
      >
        {show ? <MdVisibilityOff className="w-5 h-5" /> : <MdVisibility className="w-5 h-5" />}
      </button>
    </div>
  )
}

export default function SettingsPage({ standalone = true }: { standalone?: boolean }) {
  const { session, signOut, profile } = useAuth()
  const navigate = useNavigate()

  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPw,        setSavingPw]        = useState(false)
  const [pwDone,          setPwDone]          = useState(false)
  const [signingOut,      setSigningOut]      = useState(false)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const tooShort = newPassword.length > 0 && newPassword.length < 8
  const canSave  = newPassword.length >= 8 && newPassword === confirmPassword

  async function handleChangePassword() {
    if (!canSave) return
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPw(false)
    if (error) {
      toast.error(`Could not update password: ${error.message}`)
      return
    }
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
    <div className="flex-1 overflow-y-auto">
      {standalone && <Header title="Settings" />}

      <div className="max-w-2xl mx-auto p-6 space-y-5">

        {/* Change Password */}
        <div className="bg-white border border-brand-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-brand-border">
            <div className="w-8 h-8 bg-primary-pale rounded-lg flex items-center justify-center flex-shrink-0">
              <MdLock className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-brand-text">Change Password</h3>
              <p className="text-xs text-brand-muted">Use at least 8 characters</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {pwDone && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <MdCheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm font-medium text-green-800">Password updated successfully.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-brand-text mb-2">New Password</label>
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new password"
              />
              {tooShort && (
                <p className="text-xs text-danger mt-1">Must be at least 8 characters</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-2">Confirm New Password</label>
              <div className="relative">
                <div className={mismatch ? '[&_input]:border-danger [&_input]:focus:ring-danger' : ''}>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              {mismatch && (
                <p className="text-xs text-danger mt-1">Passwords do not match</p>
              )}
            </div>

            <Button
              onClick={handleChangePassword}
              loading={savingPw}
              disabled={!canSave}
              fullWidth
            >
              <MdLock className="w-4 h-4" />
              Update Password
            </Button>
          </div>
        </div>

        {/* Account info */}
        <div className="bg-white border border-brand-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-brand-border">
            <div className="w-8 h-8 bg-primary-pale rounded-lg flex items-center justify-center flex-shrink-0">
              <MdInfo className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-bold text-brand-text">Account</h3>
          </div>
          <div className="divide-y divide-brand-border">
            {[
              { label: 'Email',       value: session?.user.email ?? '—' },
              { label: 'Role',        value: profile?.role?.replace('_', ' ') ?? '—', capitalize: true },
              { label: 'Last Sign In', value: lastSignIn },
            ].map(({ label, value, capitalize }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-brand-muted">{label}</span>
                <span className={`text-sm font-medium text-brand-text ${capitalize ? 'capitalize' : ''}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Security tips */}
        <div className="bg-white border border-brand-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-brand-border">
            <div className="w-8 h-8 bg-primary-pale rounded-lg flex items-center justify-center flex-shrink-0">
              <MdSecurity className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-bold text-brand-text">Security Tips</h3>
          </div>
          <div className="p-5 space-y-2">
            {[
              'Use a unique password not shared with other services.',
              'Never share your login with team members — every user should have their own account.',
              'Log out from shared or public devices after each session.',
            ].map((tip) => (
              <div key={tip} className="flex items-start gap-2.5">
                <MdDevices className="w-4 h-4 text-brand-muted flex-shrink-0 mt-0.5" />
                <p className="text-sm text-brand-muted">{tip}</p>
              </div>
            ))}
          </div>
        </div>

        {/* App info */}
        <div className="bg-white border border-brand-border rounded-xl px-5 py-3 flex items-center justify-between">
          <span className="text-sm text-brand-muted">App Version</span>
          <span className="text-sm font-medium text-brand-text">1.0.0</span>
        </div>

        {/* Sign Out */}
        <div className="bg-white border border-brand-border rounded-2xl p-5">
          <Button
            variant="danger"
            onClick={handleSignOut}
            loading={signingOut}
            fullWidth
            size="lg"
          >
            <MdLogout className="w-5 h-5" />
            Sign Out
          </Button>
        </div>

      </div>
    </div>
  )
}
