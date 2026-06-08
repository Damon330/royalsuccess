import { useState, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import Button from '../components/shared/Button'
import toast from 'react-hot-toast'
import { MdPhoneAndroid } from 'react-icons/md'
import { FcGoogle } from 'react-icons/fc'

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSignupHint, setShowSignupHint] = useState(false)

  async function handleGoogleSignIn() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) { toast.error(error.message); setLoading(false) }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    })
    setLoading(false)
    if (error) { toast.error(error.message) }
    else { toast.success('Reset link sent! Check your inbox.') }
  }

  async function handleEmailAuth(e: FormEvent) {
    e.preventDefault()
    setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })
      if (error) { toast.error(error.message) }
      else { toast.success('Account created! Awaiting admin approval.') }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (error.message.toLowerCase().includes('confirm')) {
          toast.error('Please confirm your email first — check your inbox.')
        } else {
          setShowSignupHint(true)
        }
      } else {
        setShowSignupHint(false)
      }
    }

    setLoading(false)
  }

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

        {/* Google OAuth — primary CTA */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 border-2 border-brand-border hover:border-primary hover:bg-primary-pale rounded-xl py-3 px-4 font-medium text-brand-text transition-all duration-150 min-h-touch disabled:opacity-60"
        >
          <FcGoogle className="w-5 h-5" />
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 border-t border-brand-border" />
          <span className="text-xs text-brand-muted font-medium">or</span>
          <div className="flex-1 border-t border-brand-border" />
        </div>

        {/* Forgot password form */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <Button type="submit" loading={loading} fullWidth size="lg">
              Send Reset Link
            </Button>
            <p className="text-center text-sm text-brand-muted">
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-primary font-medium hover:underline"
              >
                Back to Sign In
              </button>
            </p>
          </form>
        )}

        {/* Email/password form */}
        {mode !== 'forgot' && (
          <>
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-brand-text mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setShowSignupHint(false) }}
                  placeholder="you@example.com"
                  className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-brand-text">Password</label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <Button type="submit" loading={loading} fullWidth size="lg">
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Button>

              {mode === 'signin' && showSignupHint && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
                  <p className="font-medium text-amber-800">Email or password is incorrect.</p>
                  <p className="text-amber-700 mt-0.5">
                    No account with this email?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('signup'); setShowSignupHint(false) }}
                      className="font-semibold underline hover:text-amber-900"
                    >
                      Create one now
                    </button>
                  </p>
                </div>
              )}
            </form>

            <p className="text-center text-sm text-brand-muted mt-5">
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setShowSignupHint(false) }}
                className="text-primary font-medium hover:underline"
              >
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
