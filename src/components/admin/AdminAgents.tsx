import { useState, useRef } from 'react'
import Header from '../shared/Header'
import Badge from '../shared/Badge'
import Button from '../shared/Button'
import Modal from '../shared/Modal'
import Spinner from '../shared/Spinner'
import Pagination from '../shared/Pagination'
import { useProfiles } from '../../hooks/useProfiles'
import { useAgentsPage, AGENTS_PAGE_SIZE } from '../../hooks/useAgentsPage'
import type { Profile, Role } from '../../types'
import { MdPersonAdd, MdEdit, MdWarning, MdRefresh, MdSearch } from 'react-icons/md'

function RoleModal({
  title, user, teamLeads, onClose, onSave,
}: {
  title: string; user: Profile; teamLeads: Profile[]
  onClose: () => void; onSave: (role: Role, teamLeadId?: string) => Promise<void>
}) {
  const [role, setRole] = useState<Role>(user.role === 'admin' ? 'agent' : user.role)
  const [teamLeadId, setTeamLeadId] = useState(user.team_lead_id ?? '')
  const [saving, setSaving] = useState(false)

  async function handle() {
    setSaving(true)
    await onSave(role, role === 'agent' ? teamLeadId || undefined : undefined)
    setSaving(false)
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Assign Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}
            className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="agent">Agent</option>
            <option value="team_lead">Team Lead</option>
          </select>
        </div>
        {role === 'agent' && (
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1">Assign to Team Lead</label>
            <select value={teamLeadId} onChange={(e) => setTeamLeadId(e.target.value)}
              className="w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">— Select Team Lead —</option>
              {teamLeads.map((tl) => <option key={tl.id} value={tl.id}>{tl.full_name}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button onClick={handle} loading={saving} fullWidth>Save</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function AdminAgents() {
  const { teamLeads, approveUser, updateRole } = useProfiles()
  const [approvingUser, setApprovingUser] = useState<Profile | null>(null)
  const [editingUser,   setEditingUser]   = useState<Profile | null>(null)

  const [page,            setPage]           = useState(1)
  const [roleFilter,      setRoleFilter]     = useState<'all' | 'agent' | 'team_lead'>('all')
  const [statusFilter,    setStatusFilter]   = useState<'all' | 'active' | 'pending'>('all')
  const [search,          setSearch]         = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useAgentsPage(page, { role: roleFilter, status: statusFilter, search: debouncedSearch || undefined })

  const profiles   = data?.profiles   ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1

  const pending = profiles.filter((p) => p.status === 'pending')
  const active  = profiles.filter((p) => p.status === 'active')

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Agents & Team Leads" />
      <div className="p-6 space-y-6">

        {isError && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <MdWarning className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">Database connection failed</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {(error as Error)?.message ?? 'Go to supabase.com → resume project → Refresh.'}
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              <MdRefresh className="w-4 h-4" /> Refresh
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'agent', 'team_lead'] as const).map((r) => (
              <button key={r} onClick={() => { setRoleFilter(r); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  roleFilter === r ? 'bg-primary text-white' : 'bg-white border border-brand-border text-brand-muted hover:bg-gray-50'
                }`}>
                {r === 'all' ? 'All Roles' : r === 'team_lead' ? 'Team Lead' : 'Agent'}
              </button>
            ))}
            {(['all', 'active', 'pending'] as const).map((s) => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === s ? 'bg-primary text-white' : 'bg-white border border-brand-border text-brand-muted hover:bg-gray-50'
                }`}>
                {s === 'all' ? 'All Status' : s === 'active' ? 'Active' : 'Pending'}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:max-w-xs">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
            <input
              type="text"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => {
                const val = e.target.value
                setSearch(val)
                setPage(1)
                if (searchTimer.current) clearTimeout(searchTimer.current)
                searchTimer.current = setTimeout(() => setDebouncedSearch(val), 400)
              }}
              className="w-full border border-brand-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : (
          <>
            {/* Pending — only shown when status filter is 'all' or 'pending' */}
            {statusFilter !== 'active' && pending.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                  <MdPersonAdd className="w-4 h-4" /> Pending Approval ({pending.length})
                </h2>
                <div className="space-y-2">
                  {pending.map((user) => (
                    <div key={user.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-3 border border-yellow-100">
                      <div>
                        <p className="text-sm font-medium text-brand-text">{user.full_name}</p>
                        <p className="text-xs text-brand-muted">{new Date(user.created_at).toLocaleDateString()}</p>
                      </div>
                      <Button size="sm" onClick={() => setApprovingUser(user)}>Approve</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active members table */}
            <div className="bg-white rounded-xl border border-brand-border shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
                <h2 className="text-base font-semibold text-brand-text">
                  Active Members
                  {totalCount > 0 && <span className="ml-2 text-sm font-normal text-brand-muted">({totalCount})</span>}
                </h2>
                {isFetching && !isLoading && <Spinner size="sm" />}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-brand-border">
                    <tr>
                      {['Name', 'Role', 'Team Lead', 'Joined', 'Actions'].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-brand-muted uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {active.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 font-medium text-brand-text">{user.full_name}</td>
                        <td className="px-5 py-4">
                          <Badge variant={user.role === 'team_lead' ? 'blue' : 'green'}>
                            {user.role === 'team_lead' ? 'Team Lead' : 'Agent'}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-brand-muted">
                          {user.role === 'agent'
                            ? teamLeads.find((tl) => tl.id === user.team_lead_id)?.full_name ?? '—'
                            : '—'}
                        </td>
                        <td className="px-5 py-4 text-brand-muted">{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="px-5 py-4">
                          <Button variant="ghost" size="sm" onClick={() => setEditingUser(user)}>
                            <MdEdit className="w-4 h-4" /> Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {active.length === 0 && !pending.length && (
                      <tr><td colSpan={5} className="px-5 py-10 text-center text-brand-muted">
                        {isError ? 'Could not load members — check connection.' : 'No members match your filter.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  pageSize={AGENTS_PAGE_SIZE}
                  onPageChange={setPage}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {approvingUser && (
        <RoleModal title={`Approve: ${approvingUser.full_name}`} user={approvingUser} teamLeads={teamLeads}
          onClose={() => setApprovingUser(null)}
          onSave={async (role, tlId) => { await approveUser(approvingUser.id, role, tlId); setApprovingUser(null) }} />
      )}
      {editingUser && (
        <RoleModal title={`Edit: ${editingUser.full_name}`} user={editingUser} teamLeads={teamLeads}
          onClose={() => setEditingUser(null)}
          onSave={async (role, tlId) => { await updateRole(editingUser.id, role, tlId); setEditingUser(null) }} />
      )}
    </div>
  )
}
