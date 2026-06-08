import { useAuth } from '../hooks/useAuth'
import { MdAccessTime, MdPhoneAndroid } from 'react-icons/md'
import Button from '../components/shared/Button'
import toast from 'react-hot-toast'

export default function PendingPage() {
  const { signOut, profile } = useAuth()

  async function handleSignOut() {
    await signOut()
    toast('Signed out.')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-primary-light flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="inline-flex items-center justify-center bg-primary rounded-2xl p-4 mb-4">
          <MdPhoneAndroid className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-primary mb-1">Royal Success</h1>

        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 my-6">
          <MdAccessTime className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-brand-text">Account Pending Approval</h2>
          <p className="text-sm text-brand-muted mt-2 leading-relaxed">
            Hello <span className="font-medium text-brand-text">{profile?.full_name ?? 'there'}</span>! Your account has been
            created and is awaiting admin approval. You'll be able to access the app once the
            admin assigns your role.
          </p>
        </div>

        <p className="text-xs text-brand-muted mb-5">
          Please contact your administrator if this takes too long.
        </p>

        <Button variant="secondary" onClick={handleSignOut} fullWidth>
          Sign Out
        </Button>
      </div>
    </div>
  )
}
