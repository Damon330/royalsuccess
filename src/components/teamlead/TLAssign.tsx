import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { usePhones } from '../../hooks/usePhones'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/withTimeout'
import type { Profile } from '../../types'
import Header from '../shared/Header'
import Spinner from '../shared/Spinner'
import toast from 'react-hot-toast'
import {
  MdPhoneAndroid, MdPerson, MdCheckBox, MdCheckBoxOutlineBlank, MdAssignment,
} from 'react-icons/md'

export default function TLAssign() {
  const { profile } = useAuth()

  // Load only the team lead's own assigned phones — these are the ones
  // they can redistribute to agents under them.
  const { phones, loading: phonesLoading, assignPhones } = usePhones(profile?.id)

  const [agents,        setAgents]        = useState<Profile[]>([])
  const [agentsLoading, setAgentsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set())
  const [assigning,     setAssigning]     = useState(false)

  // Phones still in the team lead's hands and available to assign out
  const myStock = phones.filter(
    (p) => p.assigned_to === profile?.id && p.status === 'assigned',
  )

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

  function toggleAll() {
    setSelectedIds(
      selectedIds.size === myStock.length
        ? new Set()
        : new Set(myStock.map((p) => p.id)),
    )
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

            {/* Team lead's own stock */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-brand-text flex items-center gap-2">
                  <MdPhoneAndroid className="w-4 h-4 text-primary" />
                  My Stock ({myStock.length})
                </p>
                {myStock.length > 1 && (
                  <button
                    onClick={toggleAll}
                    className="text-xs text-primary font-medium hover:underline"
                  >
                    {selectedIds.size === myStock.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>

              {myStock.length === 0 ? (
                <div className="bg-white border border-brand-border rounded-2xl p-8 text-center">
                  <MdPhoneAndroid className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-brand-text">No phones in your stock</p>
                  <p className="text-xs text-brand-muted mt-1">
                    Admin needs to assign phones to you first.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myStock.map((phone) => {
                    const selected = selectedIds.has(phone.id)
                    return (
                      <button
                        key={phone.id}
                        onClick={() => togglePhone(phone.id)}
                        className={`w-full flex items-center gap-3 bg-white rounded-2xl border p-4 text-left transition-colors ${
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
                          {phone.imei
                            ? <p className="text-xs font-mono text-brand-muted truncate">IMEI: {phone.imei}</p>
                            : <p className="text-xs font-mono text-brand-muted truncate">SN: {phone.serial_number}</p>
                          }
                        </div>
                      </button>
                    )
                  })}
                </div>
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
