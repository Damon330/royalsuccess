import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { unassignPhone } from '../../hooks/usePhones'
import { supabase } from '../../lib/supabase'
import { withTimeout } from '../../lib/withTimeout'
import type { Phone, Profile } from '../../types'
import Header from '../shared/Header'
import Badge from '../shared/Badge'
import Spinner from '../shared/Spinner'
import { MdExpandMore, MdExpandLess, MdUndo, MdSearch, MdClose } from 'react-icons/md'

const PAGE_SIZE = 8

interface AgentWithPhones { profile: Profile; phones: Phone[] }

function matchesPhone(phone: Phone, q: string): boolean {
  if (!q.trim()) return true
  const term = q.toLowerCase().trim()
  return (
    phone.model.toLowerCase().includes(term) ||
    (phone.imei?.toLowerCase().includes(term) ?? false) ||
    (phone.barcode?.toLowerCase().includes(term) ?? false) ||
    phone.serial_number.toLowerCase().includes(term)
  )
}

function AgentPhoneList({ phones, onUnassign, unassigning }: {
  phones:      Phone[]
  onUnassign:  (id: string) => void
  unassigning: string | null
}) {
  const [search, setSearch] = useState('')
  const [page,   setPage]   = useState(1)

  useEffect(() => { setPage(1) }, [search])

  const filtered = phones.filter((p) => matchesPhone(p, search))
  const paged    = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPgs = Math.ceil(filtered.length / PAGE_SIZE)

  const start = (page - 1) * PAGE_SIZE + 1
  const end   = Math.min(page * PAGE_SIZE, filtered.length)

  return (
    <div className="border-t border-brand-border">
      {/* Per-agent IMEI search */}
      {phones.length > PAGE_SIZE && (
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-muted pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search IMEI, model…"
              className="w-full pl-8 pr-8 py-2 text-xs border border-brand-border rounded-lg bg-brand-bg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text"
              >
                <MdClose className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {search && (
            <p className="text-[11px] text-brand-muted mt-1 pl-0.5">
              {filtered.length} of {phones.length} match
            </p>
          )}
        </div>
      )}

      {phones.length === 0 ? (
        <p className="px-4 py-4 text-sm text-brand-muted">No phones assigned.</p>
      ) : filtered.length === 0 ? (
        <div className="px-4 py-4 text-center">
          <p className="text-sm text-brand-muted">No phones match "{search}"</p>
          <button onClick={() => setSearch('')} className="text-xs text-primary font-medium hover:underline mt-1">
            Clear
          </button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-brand-border">
            {paged.map((ph) => (
              <div key={ph.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-text truncate">{ph.model}</p>
                  {ph.imei
                    ? <p className="text-xs font-mono text-brand-muted truncate">IMEI: {ph.imei}</p>
                    : <p className="text-xs font-mono text-brand-muted truncate">SN: {ph.serial_number}</p>
                  }
                  {ph.barcode && ph.barcode !== ph.imei && (
                    <p className="text-xs font-mono text-brand-muted truncate">Barcode: {ph.barcode}</p>
                  )}
                </div>

                {ph.status === 'assigned' ? (
                  <button
                    onClick={() => onUnassign(ph.id)}
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
            ))}
          </div>

          {/* Pagination */}
          {totalPgs > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-brand-border bg-brand-bg/50">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-2.5 py-1 text-xs font-semibold text-primary border border-primary/30 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary-pale transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-brand-muted tabular-nums">
                {start}–{end} of {filtered.length}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === totalPgs}
                className="px-2.5 py-1 text-xs font-semibold text-primary border border-primary/30 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary-pale transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function TLAgents() {
  const { profile } = useAuth()

  const [agents,        setAgents]        = useState<AgentWithPhones[]>([])
  const [loading,       setLoading]       = useState(true)
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null)
  const [unassigning,   setUnassigning]   = useState<string | null>(null)
  const [agentSearch,   setAgentSearch]   = useState('')

  const loadAgents = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      const { data: rows } = await withTimeout(
        supabase
          .from('profiles')
          .select('id,full_name,phone_number,role,team_lead_id,status,created_at, phones:phones(id,model,imei,serial_number,barcode,status,assigned_to)')
          .eq('team_lead_id', profile.id)
          .eq('status', 'active'),
        10_000,
      )
      if (!rows) return

      setAgents(
        (rows as Array<Profile & { phones: Phone[] }>).map((a) => ({
          profile: a as Profile,
          phones:  (a.phones ?? []) as Phone[],
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

  // Filter agents by name OR by any of their phone IMEIs/models
  const filteredAgents = agents.filter(({ profile: a, phones }) => {
    if (!agentSearch.trim()) return true
    const term = agentSearch.toLowerCase().trim()
    return (
      a.full_name.toLowerCase().includes(term) ||
      phones.some(
        (p) =>
          p.model.toLowerCase().includes(term) ||
          (p.imei?.toLowerCase().includes(term) ?? false) ||
          (p.barcode?.toLowerCase().includes(term) ?? false) ||
          p.serial_number.toLowerCase().includes(term),
      )
    )
  })

  return (
    <div>
      <Header title="My Agents" />
      <div className="px-4 pt-4 pb-8 max-w-lg mx-auto space-y-3">

        {/* Agent / IMEI search */}
        {!loading && agents.length > 0 && (
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted pointer-events-none" />
            <input
              type="search"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
              placeholder="Search by agent name or IMEI…"
              className="w-full pl-9 pr-9 py-2.5 text-sm border border-brand-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            {agentSearch && (
              <button
                type="button"
                onClick={() => setAgentSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text"
              >
                <MdClose className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {agentSearch && !loading && (
          <p className="text-xs text-brand-muted pl-1">
            {filteredAgents.length} of {agents.length} agents match
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : agents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-border p-10 text-center">
            <p className="font-semibold text-brand-text">No agents yet</p>
            <p className="text-sm text-brand-muted mt-1">Agents you approve will appear here.</p>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-brand-border p-8 text-center">
            <MdSearch className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm font-semibold text-brand-text">No results for "{agentSearch}"</p>
            <button
              onClick={() => setAgentSearch('')}
              className="mt-2 text-xs text-primary font-semibold hover:underline"
            >
              Clear search
            </button>
          </div>
        ) : (
          filteredAgents.map(({ profile: agent, phones }) => {
            const sold      = phones.filter((p) => p.status === 'sold').length
            const assigned  = phones.filter((p) => p.status === 'assigned').length
            const isExpanded = expandedAgent === agent.id

            return (
              <div key={agent.id} className="bg-white rounded-2xl border border-brand-border overflow-hidden">

                {/* Agent header row */}
                <button
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                  className="w-full flex items-center justify-between px-4 py-4 hover:bg-brand-bg active:bg-brand-border/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-primary rounded-full h-9 w-9 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {agent.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-brand-text">{agent.full_name}</p>
                      <p className="text-xs text-brand-muted">
                        {assigned} assigned · {sold} sold · {phones.length} total
                      </p>
                    </div>
                  </div>
                  {isExpanded
                    ? <MdExpandLess className="w-5 h-5 text-brand-muted flex-shrink-0" />
                    : <MdExpandMore className="w-5 h-5 text-brand-muted flex-shrink-0" />
                  }
                </button>

                {/* Phone list with per-agent search + pagination */}
                {isExpanded && (
                  <AgentPhoneList
                    phones={phones}
                    onUnassign={handleUnassign}
                    unassigning={unassigning}
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
