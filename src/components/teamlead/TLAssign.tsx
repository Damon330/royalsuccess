import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { usePhones } from '../../hooks/usePhones'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/withTimeout'
import type { Phone, Profile } from '../../types'
import Header from '../shared/Header'
import Spinner from '../shared/Spinner'
import toast from 'react-hot-toast'
import {
  MdPhoneAndroid, MdPerson, MdCheckBox, MdCheckBoxOutlineBlank, MdAssignment,
  MdSearch, MdClose,
} from 'react-icons/md'

const PAGE_SIZE = 10

function matchesSearch(phone: Phone, q: string): boolean {
  if (!q.trim()) return true
  const term = q.toLowerCase().trim()
  return (
    phone.model.toLowerCase().includes(term) ||
    (phone.imei?.toLowerCase().includes(term) ?? false) ||
    (phone.barcode?.toLowerCase().includes(term) ?? false) ||
    phone.serial_number.toLowerCase().includes(term)
  )
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by IMEI, model, barcode…"
        className="w-full pl-9 pr-9 py-2.5 text-sm border border-brand-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text"
          aria-label="Clear search"
        >
          <MdClose className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end   = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between mt-3 px-1">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary-pale transition-colors"
      >
        ← Prev
      </button>
      <span className="text-xs text-brand-muted font-medium tabular-nums">
        {start}–{end} of {total}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="px-3 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary-pale transition-colors"
      >
        Next →
      </button>
    </div>
  )
}

export default function TLAssign() {
  const { profile } = useAuth()

  const { phones, loading: phonesLoading, assignPhones } = usePhones(profile?.id)

  const [agents,        setAgents]        = useState<Profile[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set())
  const [assigning,     setAssigning]     = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [stockPage,     setStockPage]     = useState(1)

  useEffect(() => { setStockPage(1) }, [searchQuery])

  const myStock = phones.filter(
    (p) => p.assigned_to === profile?.id && p.status === 'assigned',
  )

  const filteredStock = myStock.filter((p) => matchesSearch(p, searchQuery))
  const pagedStock    = filteredStock.slice((stockPage - 1) * PAGE_SIZE, stockPage * PAGE_SIZE)

  const loadAgents = useCallback(async () => {
    if (!profile) return
    setAgentsLoading(true)
    try {
      const { data } = await withTimeout(
        supabase
          .from('profiles')
          .select('id, full_name, role, status, team_lead_id')
          .eq('team_lead_id', profile.id)
          .eq('status', 'active'),
        8000,
      )
      setAgents((data as Profile[]) ?? [])
    } catch {
      toast.error('Could not load agents.')
    } finally {
      setAgentsLoading(false)
    }
  }, [profile])

  useEffect(() => { loadAgents() }, [loadAgents])

  function togglePhone(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // "Select all" / "Deselect all" only operates on the currently visible filtered list
  function toggleAll() {
    const filteredIds = filteredStock.map((p) => p.id)
    const allFilteredSelected = filteredIds.every((id) => selectedIds.has(id))

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id))
      } else {
        filteredIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  async function handleAssign() {
    if (!profile || !selectedAgent || selectedIds.size === 0) {
      toast.error('Select an agent and at least one phone.')
      return
    }
    const agent = agents.find((a) => a.id === selectedAgent)
    if (!agent) return

    setAssigning(true)
    const ok = await assignPhones([...selectedIds], selectedAgent, profile, agent.full_name)
    if (ok) setSelectedIds(new Set())
    setAssigning(false)
  }

  const isLoading = phonesLoading || agentsLoading

  // Whether all currently visible (filtered) phones are selected
  const allFilteredSelected =
    filteredStock.length > 0 && filteredStock.every((p) => selectedIds.has(p.id))

  return (
    <div>
      <Header title="Assign Phones" />
      <div className="px-4 pt-4 pb-8 max-w-lg mx-auto space-y-5">

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : (
          <>
            {/* Agent selector */}
            <div className="bg-white border border-brand-border rounded-2xl p-4 space-y-3">
              <p className="text-sm font-semibold text-brand-text flex items-center gap-2">
                <MdPerson className="w-4 h-4 text-primary" />
                Assign to Agent
              </p>
              {agents.length === 0 ? (
                <p className="text-sm text-brand-muted">No active agents under you yet.</p>
              ) : (
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full border border-brand-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                >
                  <option value="">— Select agent —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* My stock — with IMEI search + pagination */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-brand-text flex items-center gap-2">
                  <MdPhoneAndroid className="w-4 h-4 text-primary" />
                  My Stock ({myStock.length})
                  {selectedIds.size > 0 && (
                    <span className="ml-1 bg-primary text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {selectedIds.size} selected
                    </span>
                  )}
                </p>
                {filteredStock.length > 1 && (
                  <button
                    onClick={toggleAll}
                    className="text-xs text-primary font-medium hover:underline"
                  >
                    {allFilteredSelected ? 'Deselect all' : 'Select all'}
                    {searchQuery ? ' (filtered)' : ''}
                  </button>
                )}
              </div>

              {/* IMEI search */}
              {myStock.length > 0 && (
                <div className="mb-3">
                  <SearchBar value={searchQuery} onChange={setSearchQuery} />
                  {searchQuery && (
                    <p className="text-xs text-brand-muted mt-1.5 pl-1">
                      {filteredStock.length} of {myStock.length} phones match
                    </p>
                  )}
                </div>
              )}

              {myStock.length === 0 ? (
                <div className="bg-white border border-brand-border rounded-2xl p-8 text-center">
                  <MdPhoneAndroid className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-brand-text">No phones in your stock</p>
                  <p className="text-xs text-brand-muted mt-1">
                    Admin needs to assign phones to you first.
                  </p>
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="bg-white border border-brand-border rounded-2xl p-8 text-center">
                  <MdSearch className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-brand-text">No phones match "{searchQuery}"</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-2 text-xs text-primary font-semibold hover:underline"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {pagedStock.map((phone) => {
                      const selected = selectedIds.has(phone.id)
                      return (
                        <button
                          key={phone.id}
                          onClick={() => togglePhone(phone.id)}
                          className={`w-full flex items-center gap-3 bg-white rounded-2xl border p-3.5 text-left transition-colors ${
                            selected
                              ? 'border-primary bg-primary-pale'
                              : 'border-brand-border hover:border-brand-border active:bg-brand-bg'
                          }`}
                        >
                          {selected
                            ? <MdCheckBox className="w-5 h-5 text-primary flex-shrink-0" />
                            : <MdCheckBoxOutlineBlank className="w-5 h-5 text-gray-300 flex-shrink-0" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-brand-text text-sm">{phone.model}</p>
                            {phone.imei ? (
                              <p className="text-xs font-mono text-brand-muted truncate">IMEI: {phone.imei}</p>
                            ) : (
                              <p className="text-xs font-mono text-brand-muted truncate">SN: {phone.serial_number}</p>
                            )}
                            {phone.barcode && phone.barcode !== phone.imei && (
                              <p className="text-xs font-mono text-brand-muted truncate">Barcode: {phone.barcode}</p>
                            )}
                          </div>
                          {selected && (
                            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </div>

                  <Pagination
                    page={stockPage}
                    total={filteredStock.length}
                    pageSize={PAGE_SIZE}
                    onChange={setStockPage}
                  />
                </>
              )}
            </div>

            {/* Assign button */}
            <button
              onClick={handleAssign}
              disabled={assigning || selectedIds.size === 0 || !selectedAgent}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-light text-white font-bold py-4 rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-touch"
            >
              <MdAssignment className="w-5 h-5" />
              {assigning
                ? 'Assigning…'
                : selectedIds.size > 0
                  ? `Assign ${selectedIds.size} Phone${selectedIds.size !== 1 ? 's' : ''} to Agent`
                  : 'Select phones to assign'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
