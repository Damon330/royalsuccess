import { useAuth } from '../hooks/useAuth'
import { useActivityLog } from '../hooks/useActivityLog'
import { useProfiles } from '../hooks/useProfiles'
import ActivityFeed, { ActivityFiltersBar } from '../components/shared/ActivityFeed'
import Header from '../components/shared/Header'

export default function ActivityPage() {
  const { profile } = useAuth()

  // Agents only ever see their own activity — pass their ID as a fixed filter
  // so both the DB query and the Realtime subscription are scoped correctly.
  const agentId = profile?.role === 'agent' ? profile.id : undefined

  const {
    entries, loading, loadingMore, hasMore, dbError,
    filters, updateFilters, fetchMore, refetch,
  } = useActivityLog({ agentId })

  const { agents } = useProfiles()

  const showAgentFilter = profile?.role === 'admin' || profile?.role === 'team_lead'

  return (
    <div className="flex-1 overflow-y-auto">
      <Header title="Activity" />
      <div className="p-6 space-y-5 max-w-3xl">

        <ActivityFiltersBar
          filters={filters}
          onUpdate={updateFilters}
          agents={showAgentFilter ? agents : []}
          showAgentFilter={showAgentFilter ?? false}
        />

        <ActivityFeed
          entries={entries}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          dbError={dbError}
          onLoadMore={fetchMore}
          onRefetch={refetch}
        />
      </div>
    </div>
  )
}
