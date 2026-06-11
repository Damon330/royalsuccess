import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { unassignPhone } from '../../hooks/usePhones'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/withTimeout'
import type { Phone, Profile } from '../../types'
import Header from '../shared/Header'
import Badge from '../shared/Badge'
import Spinner from '../shared/Spinner'
import { MdExpandMore, MdExpandLess, MdUndo } from 'react-icons/md'

interface AgentWithPhones { profile: Profile; phones: Phone[] }

export default function TLAgents() {
  const { profile } = useAuth()

  const [agents,         setAgents]         = useState<AgentWithPhones[]>([])
  const [loading,        setLoading]        = useState(true)
  const [expandedAgent,  setExpandedAgent]  = useState<string | null>(null)
  const [unassigning,    setUnassigning]    = useState<string | null>(null)

  const loadAgents = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      const { data: profiles } = await withTimeout(
        supabase
          .from('profiles')
          .select('*')
          .eq('team_lead_id', profile.id)
          .eq('status', 'active'),
        8000,
      )
      if (!profiles) return

      const ids = (profiles as Profile[]).map((a) => a.id)
      const { data: agentPhones } = ids.length > 0
        ? await withTimeout(supabase.from('phones').select('*').in('assigned_to', ids), 8000)
        : { data: [] }

      setAgents(
        (profiles as Profile[]).map((a) => ({
          profile: a,
          phones:  ((agentPhones ?? []) as Phone[]).filter((ph) => ph.assigned_to === a.id),
        })),
      )
    } catch {
      // Show empty state
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => { loadAgents() }, [loadAgents])

  async function handleUnassign(phoneId: string) {
    if (!profile) return
    setUnassigning(phoneId)
    const ok = await unassignPhone(phoneId, profile)
    if (ok) await loadAgents()
    setUnassigning(null)
  }

  return (
    <div>
      <Header title="My Agents" />
      <div className="px-4 pt-4 pb-8 max-w-lg mx-auto space-y-3">

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : agents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-border p-10 text-center">
            <p className="font-semibold text-brand-text">No agents yet</p>
            <p className="text-sm text-brand-muted mt-1">Agents you approve will appear here.</p>
          </div>
        ) : (
          agents.map(({ profile: agent, phones }) => {
            const sold      = phones.filter((p) => p.status === 'sold').length
            const assigned  = phones.filter((p) => p.status === 'assigned').length
            const isExpanded = expandedAgent === agent.id

            return (
              <div key={agent.id} className="bg-white rounded-2xl border border-brand-border overflow-hidden">

                {/* Agent header row */}
                <button
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                  className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-primary rounded-full h-9 w-9 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {agent.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-brand-text">{agent.full_name}</p>
                      <p className="text-xs text-brand-muted">
                        {assigned} assigned · {sold} sold
                      </p>
                    </div>
                  </div>
                  {isExpanded
                    ? <MdExpandLess className="w-5 h-5 text-brand-muted flex-shrink-0" />
                    : <MdExpandMore className="w-5 h-5 text-brand-muted flex-shrink-0" />
                  }
                </button>

                {/* Phones list */}
                {isExpanded && (
                  <div className="border-t border-brand-border divide-y divide-brand-border">
                    {phones.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-brand-muted">No phones assigned.</p>
                    ) : (
                      phones.map((ph) => (
                        <div key={ph.id} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-brand-text truncate">{ph.model}</p>
                            {ph.imei
                              ? <p className="text-xs font-mono text-brand-muted truncate">IMEI: {ph.imei}</p>
                              : <p className="text-xs font-mono text-brand-muted truncate">SN: {ph.serial_number}</p>
                            }
                          </div>

                          {ph.status === 'assigned' ? (
                            <button
                              onClick={() => handleUnassign(ph.id)}
                              disabled={unassigning === ph.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0"
                            >
                              <MdUndo className="w-3.5 h-3.5" />
                              {unassigning === ph.id ? '…' : 'Unassign'}
                            </button>
                          ) : (
                            <Badge variant={ph.status === 'sold' ? 'green' : 'gray'}>
                              {ph.status === 'sold' ? 'Sold' : ph.status}
                            </Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
