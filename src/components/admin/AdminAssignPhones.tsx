import { useState, useEffect } from 'react'
import Header from '../shared/Header'
import Button from '../shared/Button'
import Badge from '../shared/Badge'
import Spinner from '../shared/Spinner'
import ScannerModal from '../shared/ScannerModal'
import { usePhones } from '../../hooks/usePhones'
import { useProfiles } from '../../hooks/useProfiles'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import {
  MdCheckBox, MdCheckBoxOutlineBlank, MdPhoneAndroid,
  MdWarning, MdRefresh, MdQrCodeScanner, MdSearch, MdPerson,
} from 'react-icons/md'

export default function AdminAssignPhones() {
  const { phones, loading: phonesLoading, dbError: phonesDbError, dbErrorMsg: phonesErrMsg, assignPhones, lookupByBarcode, refetch: refetchPhones } = usePhones(undefined, 'in_stock')
  const { profiles, loading: profilesLoading, dbError: profilesDbError, dbErrorMsg: profilesErrMsg, refetch: refetchProfiles } = useProfiles()
  const { profile: adminProfile } = useAuth()

  const [selectedUser,   setSelectedUser]   = useState('')
  const [userSearch,     setUserSearch]     = useState('')
  const [selectedPhones, setSelectedPhones] = useState<string[]>([])
  const [assigning,      setAssigning]      = useState(false)
  const [showScanner,    setShowScanner]    = useState(false)
  const [diagInfo,       setDiagInfo]       = useState<string | null>(null)

  const dbError       = phonesDbError || profilesDbError

  // When an error appears, run a health check to surface the exact Supabase diagnosis.
  useEffect(() => {
    if (!dbError) { setDiagInfo(null); return }
    let cancelled = false
    async function runDiag() {
      try {
        const [{ data: health, error: hErr }, { data: { session } }] = await Promise.all([
          supabase.rpc('health_check'),
          supabase.auth.getSession(),
        ])
        if (cancelled) return
        if (hErr) {
          setDiagInfo(`health_check failed: ${hErr.message}`)
        } else {
          const email  = (health as { auth_email?: string } | null)?.auth_email ?? 'unknown'
          const isAdmin = (health as { is_admin?: boolean } | null)?.is_admin
          const expiry  = session?.expires_at
            ? new Date(session.expires_at * 1000).toLocaleTimeString()
            : 'no session'
          setDiagInfo(`DB reachable ✓ · auth_email: ${email} · is_admin: ${String(isAdmin)} · token expires: ${expiry}`)
        }
      } catch (e) {
        if (!cancelled) setDiagInfo(`Diag fetch threw: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    runDiag()
    return () => { cancelled = true }
  }, [dbError])
  const inStockPhones = phones.filter((p) => p.status === 'in_stock')
  const activeUsers   = profiles.filter((p) => p.status === 'active' && p.role !== 'admin')
  const loading       = phonesLoading || profilesLoading

  const filteredUsers = userSearch.trim()
    ? activeUsers.filter((u) => u.full_name.toLowerCase().includes(userSearch.toLowerCase()))
    : activeUsers

  const selectedUserObj = activeUsers.find((u) => u.id === selectedUser)

  function togglePhone(id: string) {
    setSelectedPhones((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function toggleAll() {
    setSelectedPhones(selectedPhones.length === inStockPhones.length ? [] : inStockPhones.map((p) => p.id))
  }

  async function handleScanResult(barcode: string) {
    const phone = await lookupByBarcode(barcode)
    if (!phone) {
      toast.error(`No phone found for barcode: ${barcode}`)
      return
    }
    if (phone.status !== 'in_stock') {
      toast.error(`${phone.model} is not in stock (status: ${phone.status}).`)
      return
    }
    setSelectedPhones((prev) => prev.includes(phone.id) ? prev : [...prev, phone.id])
    toast.success(`${phone.model} selected via scan.`)
  }

  async function handleAssign() {
    if (!selectedUser || selectedPhones.length === 0 || !adminProfile) return
    setAssigning(true)
    const assignee = activeUsers.find((u) => u.id === selectedUser)
    const ok = await assignPhones(selectedPhones, selectedUser, adminProfile, assignee?.full_name ?? selectedUser)
    if (ok) { setSelectedPhones([]); setSelectedUser(''); setUserSearch('') }
    setAssigning(false)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Assign Phones" />
      <div className="p-6 space-y-5">

        {dbError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-3">
              <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">Could not load data</p>
                {phonesErrMsg && (
                  <p className="text-xs font-mono text-amber-700 mt-0.5 break-all">Phones: {phonesErrMsg}</p>
                )}
                {profilesErrMsg && (
                  <p className="text-xs font-mono text-amber-700 mt-0.5 break-all">Profiles: {profilesErrMsg}</p>
                )}
                {diagInfo && (
                  <p className="text-xs font-mono text-amber-600 mt-1 break-all">Diag: {diagInfo}</p>
                )}
              </div>
              <button
                onClick={() => { refetchPhones(); refetchProfiles() }}
                className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
              >
                <MdRefresh className="w-4 h-4" /> Retry
              </button>
            </div>
            {(phonesErrMsg?.includes('session') || phonesErrMsg?.includes('authenticated')) && (
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-xs text-red-600 hover:text-red-800 underline ml-8"
              >
                Sign out and sign back in to refresh your session
              </button>
            )}
          </div>
        )}

        {/* Step 1: Recipient */}
        <div className="bg-white rounded-xl border border-brand-border shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-brand-text">1. Select Recipient</h2>

          {/* Search */}
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name…"
              value={userSearch}
              onChange={(e) => { setUserSearch(e.target.value); setSelectedUser('') }}
              className="w-full border border-brand-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Select */}
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">— Choose a team member —</option>
            {filteredUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role === 'team_lead' ? 'Team Lead' : 'Agent'})
              </option>
            ))}
          </select>

          {userSearch && filteredUsers.length === 0 && (
            <p className="text-xs text-brand-muted pl-1">No team members match "{userSearch}"</p>
          )}

          {/* Selected recipient chip */}
          {selectedUserObj && (
            <div className="flex items-center gap-2 bg-primary-pale border border-primary/20 rounded-lg px-3 py-2">
              <MdPerson className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm font-medium text-primary">{selectedUserObj.full_name}</span>
              <span className="text-xs text-primary/70">
                ({selectedUserObj.role === 'team_lead' ? 'Team Lead' : 'Agent'})
              </span>
              <button
                onClick={() => { setSelectedUser(''); setUserSearch('') }}
                className="ml-auto text-primary/60 hover:text-primary text-xs font-medium"
              >
                ✕ Clear
              </button>
            </div>
          )}
        </div>

        {/* Step 2: Phones */}
        <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-brand-text">
              2. Select Phones
              <span className="ml-2 text-brand-muted font-normal">({inStockPhones.length} in stock)</span>
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowScanner(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary-pale hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">
                <MdQrCodeScanner className="w-4 h-4" /> Scan to Select
              </button>
              {inStockPhones.length > 0 && (
                <button onClick={toggleAll} className="text-xs text-primary font-medium hover:underline">
                  {selectedPhones.length === inStockPhones.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Spinner size="lg" /></div>
          ) : inStockPhones.length === 0 ? (
            <div className="py-12 text-center text-brand-muted">
              <MdPhoneAndroid className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              {dbError ? 'Could not load phones.' : 'No phones in stock to assign.'}
            </div>
          ) : (
            <div className="divide-y divide-brand-border max-h-96 overflow-y-auto">
              {inStockPhones.map((phone) => {
                const checked = selectedPhones.includes(phone.id)
                return (
                  <label key={phone.id}
                    className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors ${checked ? 'bg-primary-pale' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={checked} onChange={() => togglePhone(phone.id)} className="sr-only" />
                    {checked
                      ? <MdCheckBox className="w-5 h-5 text-primary flex-shrink-0" />
                      : <MdCheckBoxOutlineBlank className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand-text">{phone.model}</p>
                      {phone.imei    && <p className="text-xs font-mono text-brand-muted">IMEI: {phone.imei}</p>}
                      {phone.barcode && <p className="text-xs font-mono text-brand-muted">Barcode: {phone.barcode}</p>}
                      <p className="text-xs font-mono text-brand-muted">SN: {phone.serial_number}</p>
                    </div>
                    <Badge variant="green" className="ml-auto flex-shrink-0">In Stock</Badge>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {selectedPhones.length > 0 && selectedUser && (
          <div className="bg-primary-pale border border-primary/20 rounded-xl p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-primary font-medium">
              Assigning <strong>{selectedPhones.length}</strong> phone(s) to{' '}
              <strong>{selectedUserObj?.full_name}</strong>
            </p>
            <Button onClick={handleAssign} loading={assigning}>Confirm Assignment</Button>
          </div>
        )}
      </div>

      <ScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanResult}
        title="Scan to Select Phone"
      />
    </div>
  )
}
