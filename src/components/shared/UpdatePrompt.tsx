import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import toast from 'react-hot-toast'
import { MdSystemUpdate } from 'react-icons/md'

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  useEffect(() => {
    if (!needRefresh) return
    toast(
      (t) => (
        <div className="flex items-center gap-3">
          <MdSystemUpdate className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-brand-text">Update available</p>
            <p className="text-xs text-brand-muted">Tap to reload with the latest version.</p>
          </div>
          <button
            onClick={() => { updateServiceWorker(true); toast.dismiss(t.id) }}
            className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            Update
          </button>
        </div>
      ),
      {
        duration: Infinity,
        id:       'sw-update',
        style:    { maxWidth: 380, padding: '12px 14px' },
      },
    )
  }, [needRefresh, updateServiceWorker])

  return null
}
