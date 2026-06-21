import { useState, useRef, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import Button from '../components/shared/Button'
import toast from 'react-hot-toast'
import { MdPhoneAndroid, MdCheckCircle } from 'react-icons/md'
import { FcGoogle } from 'react-icons/fc'

const MAX_ATTEMPTS   = 5
const LOCKOUT_MS     = 30_000  // 30 seconds
const MIN_PW_LENGTH  = 8
const PHONE_RE        = /^\+?[0-9\s().-]{7,20}$/

function validatePassword(pw: string): string | null {
  if (pw.length < MIN_PW_LENGTH) return `Password must be at least ${MIN_PW_LENGTH} characters.`
  if (!/[A-Z]/.test(pw))         return 'Password must contain at least one uppercase letter.'
  if (!/[0-9]/.test(pw))         return 'Password must contain at least one number.'
  return null
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '').slice(0, 20)
}

function validatePhone(phone: string): string | null {
  if (!phone.trim()) return 'Phone number is required.'
  if (!PHONE_RE.test(phone.trim())) return 'Enter a valid phone number.'
  return null
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const checks = [
    { label: `${MIN_PW_LENGTH}+ characters`, pass: password.length >= MIN_PW_LENGTH },
    { label: 'Uppercase letter',             pass: /[A-Z]/.test(password) },
    { label: 'Number',                       pass: /[0-9]/.test(password) },
  ]
  return (
    <div className="mt-2 space-y-1">
      {checks.map(({ label, pass }) => (
        <div key={label} className={`flex items-center gap-1.5 text-xs ${pass ? 'text-green-600' : 'text-brand-muted'}`}>
          <MdCheckCircle className={`w-3.5 h-3.5 flex-shrink-0 ${pass ? 'text-green-500' : 'text-gray-300'}`} />
          {label}
        </div>
      ))}
    </div>
  )
}

export default function LoginPage() {
  const [mode,          setMode]          = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [fullName,      setFullName]      = useState('')
  const [phoneNumber,   setPhoneNumber]   = useState('')
  const [loading,       setLoading]       = useState(false)
  const [signupHint,    setSignupHint]    = useState<'missing' | 'generic' | null>(null)

  // Client-side brute-force protection
  const attempts     = useRef(0)
  const lockedUntil  = useRef<number | null>(null)
  const [lockRemaining, setLockRemaining] = useState(0)

  function checkRateLimit(): boolean {
    if (lockedUntil.current && Date.now() < lockedUntil.current) {
      const secs = Math.ceil((lockedUntil.current - Date.now()) / 1000)
      setLockRemaining(secs)
      toast.error(`Too many attempts. Try again in ${secs}s.`)
      return false
    }
    return true
  }

  function recordAttempt(failed: boolean) {
    if (!failed) { attempts.current = 0; lockedUntil.current = null; setLockRemaining(0); return }
    attempts.current += 1
    if (attempts.current >= MAX_ATTEMPTS) {
      lockedUntil.current = Date.now() + LOCKOUT_MS
      attempts.current = 0
      const secs = Math.ceil(LOCKOUT_MS / 1000)
      setLockRemaining(secs)
      toast.error(`Too many failed attempts. Locked for ${secs}s.`)
    }
  }

  async function handleGoogleSignIn() {
    if (!checkRateLimit()) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { toast.error('Google sign-in failed. Please try again.'); setLoading(false) }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault()
    if (!checkRateLimit()) return
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    // Always show success — prevents email enumeration
    if (error) { console.warn('[reset]', error.message) }
    toast.success('If that email exists, a reset link has been sent.')
  }

  async function handleEmailAuth(e: FormEvent) {
    e.preventDefault()
    if (!checkRateLimit()) return

    const cleanEmail = normalizeEmail(email)

    if (mode === 'signup') {
      const pwError = validatePassword(password)
      if (pwError) { toast.error(pwError); return }
      if (!fullName.trim()) { toast.error('Full name is required.'); return }
      const phoneError = validatePhone(phoneNumber)
      if (phoneError) { toast.error(phoneError); return }

      setLoading(true)
      const { data: existingAccount, error: signupLookupError } = await supabase.rpc('auth_email_exists', {
        p_email: cleanEmail,
      })

      if (!signupLookupError && existingAccount === true) {
        setLoading(false)
        toast.error('An account already exists for this email. Sign in instead.')
        setMode('signin')
        return
      }

      const { error } = await supabase.auth.signUp({
        email:    cleanEmail,
        password,
        options: {
          data: {
            full_name:    fullName.trim(),
            phone_number: normalizePhone(phoneNumber),
          },
        },
      })
      setLoading(false)
      if (error) {
        // Generic message — don't reveal whether email is already registered
        toast.error('Could not create account. Check your details and try again.')
        recordAttempt(true)
      } else {
        toast.success('Account created. Check your email, then await admin approval.')
        recordAttempt(false)
      }
      return
    }

    setLoading(true)

    const { data: emailExists, error: lookupError } = await supabase.rpc('auth_email_exists', {
      p_email: cleanEmail,
    })

    if (!lookupError && emailExists === false) {
      setLoading(false)
      setSignupHint('missing')
      toast.error('No account found for this email.')
      recordAttempt(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email:    cleanEmail,
      password,
    })
    setLoading(false)

    if (error) {
      toast.error('Email or password is incorrect.')
      setSignupHint(lookupError ? 'generic' : null)
      recordAttempt(true)
    } else {
      setSignupHint(null)
      recordAttempt(false)
    }
  }

  const isLocked = lockedUntil.current !== null && Date.now() < lockedUntil.current

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-primary-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-primary rounded-2xl p-4 mb-4">
            <MdPhoneAndroid className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-primary">Royal Success</h1>
          <p className="text-brand-muted mt-1 text-sm">Phone Inventory & Field Sales</p>
        </div>

        {isLocked && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700 text-center font-medium">
            Account locked for {lockRemaining}s after too many failed attempts.
          </div>
        )}

        {/* Google OAuth — primary CTA */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading || isLocked}
          className="w-full flex items-center justify-center gap-3 border-2 border-brand-border hover:border-primary hover:bg-primary-pale rounded-xl py-3 px-4 font-medium text-brand-text transition-all duration-150 min-h-touch disabled:opacity-60"
        >
          <FcGoogle className="w-5 h-5" />
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 border-t border-brand-border" />
          <span className="text-xs text-brand-muted font-medium">or</span>
          <div className="flex-1 border-t border-brand-border" />
        </div>

        {/* Forgot password */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">Email Address</label>
              <input
                type="email" required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <Button type="submit" loading={loading} fullWidth size="lg">Send Reset Link</Button>
            <p className="text-center text-sm text-brand-muted">
              <button type="button" onClick={() => setMode('signin')} className="text-primary font-medium hover:underline">
                Back to Sign In
              </button>
            </p>
          </form>
        )}

        {/* Sign in / Sign up */}
        {mode !== 'forgot' && (
          <>
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === 'signup' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-brand-text mb-1">Full Name</label>
                    <input
                      type="text" required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      maxLength={100}
                      className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-brand-text mb-1">Phone Number</label>
                    <input
                      type="tel" required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(normalizePhone(e.target.value))}
                      placeholder="+234 XXX XXX XXXX"
                      autoComplete="tel"
                      maxLength={20}
                      className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">Email Address</label>
                <input
                  type="email" required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setSignupHint(null) }}
                  placeholder="you@example.com"
                  autoComplete={mode === 'signin' ? 'username' : 'email'}
                  className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-brand-text">Password</label>
                  {mode === 'signin' && (
                    <button type="button" onClick={() => setMode('forgot')} className="text-xs text-primary hover:underline">
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password" required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={mode === 'signup' ? MIN_PW_LENGTH : 1}
                  className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                {mode === 'signup' && <PasswordStrength password={password} />}
              </div>

              <Button type="submit" loading={loading} disabled={isLocked} fullWidth size="lg">
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Button>

              {mode === 'signin' && signupHint && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
                  <p className="font-medium text-amber-800">
                    {signupHint === 'missing' ? 'No account found for this email.' : 'Email or password is incorrect.'}
                  </p>
                  <p className="text-amber-700 mt-0.5">
                    {signupHint === 'missing' ? 'Create an account to request access.' : 'Need a new account?'}{' '}
                    <button type="button" onClick={() => { setMode('signup'); setSignupHint(null) }}
                      className="font-semibold underline hover:text-amber-900">
                      Create Account
                    </button>
                  </p>
                </div>
              )}
            </form>

            <p className="text-center text-sm text-brand-muted mt-5">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setSignupHint(null) }}
                className="text-primary font-medium hover:underline">
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
