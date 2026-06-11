import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { playAlertSound, primeAudioContext } from '../lib/saleSound'
import type { Profile, Role } from '../types'
import toast from 'react-hot-toast'

const QUERY_TIMEOUT  = 8000
const MUTATE_TIMEOUT = 12000
const CACHE_TTL_MS   = 5 * 60 * 1000  // 5 minutes

// Module-level cache — shared across all useProfiles instances on the same page
// so that admin pages that all call useProfiles don't each fire a separate DB query.
let _profilesCache:    Profile[] | null = null
let _profilesCacheAt:  number          = 0

function getCached(): Profile[] | null {
  if (!_profilesCache) return null
  if (Date.now() - _profilesCacheAt > CACHE_TTL_MS) { _profilesCache = null; return null }
  return _profilesCache
}

function setCache(data: Profile[]) {
  _profilesCache   = data
  _profilesCacheAt = Date.now()
}

function invalidateCache() {
  _profilesCache  = null
  _profilesCacheAt = 0
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>(() => getCached() ?? [])
  const [loading,  setLoading]  = useState(() => getCached() === null)
  const [dbError,  setDbError]  = useState(false)
  const isFirstLoad  = useRef(true)
  // Unique channel name per hook instance — prevents Supabase from reusing an
  // already-subscribed channel when multiple components call useProfiles() simultaneously.
  const channelName = useMemo(() => `profiles-${Math.random().toString(36).slice(2)}`, [])

  const fetchProfiles = useCallback(async (force = false) => {
    const cached = getCached()
    if (cached && !force) { setProfiles(cached); setLoading(false); return }

    setLoading(true)
    setDbError(false)
    try {
      const { data, error } = await withTimeout(
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        QUERY_TIMEOUT,
      )
      if (error) throw error
      const rows = data ?? []
      setCache(rows)
      setProfiles(rows)
    } catch {
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfiles()

    // Realtime: pick up new signups immediately so admin sees pending users
    // without waiting for the 5-minute cache to expire.
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload) => {
        const newProfile = payload.new as Profile
        // Update local state and cache
        setProfiles((prev) => {
          if (prev.find((p) => p.id === newProfile.id)) return prev
          const updated = [newProfile, ...prev]
          setCache(updated)
          return updated
        })
        // Play alert sound for new pending users (skip on initial load)
        if (!isFirstLoad.current && newProfile.status === 'pending') {
          playAlertSound()
          toast('New user pending approval — check Agents tab.', { icon: '👤' })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const updated = payload.new as Profile
        setProfiles((prev) => {
          const next = prev.map((p) => p.id === updated.id ? updated : p)
          setCache(next)
          return next
        })
      })
      .subscribe()

    isFirstLoad.current = false
    document.addEventListener('click', primeAudioContext, { once: true })

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [fetchProfiles])

  async function approveUser(userId: string, role: Role, teamLeadId?: string) {
    const update: Partial<Profile> = { status: 'active', role }
    if (teamLeadId) update.team_lead_id = teamLeadId
    try {
      const { error } = await withTimeout(
        supabase.from('profiles').update(update).eq('id', userId),
        MUTATE_TIMEOUT,
      )
      if (error) { toast.error(`Failed: ${error.message}`); return false }
      toast.success('User approved.')
      invalidateCache()
      await fetchProfiles(true)
      return true
    } catch {
      toast.error('Database connection failed.')
      return false
    }
  }

  async function updateRole(userId: string, role: Role, teamLeadId?: string | null) {
    try {
      const { error } = await withTimeout(
        supabase.from('profiles')
          .update({ role, team_lead_id: teamLeadId ?? null })
          .eq('id', userId),
        MUTATE_TIMEOUT,
      )
      if (error) { toast.error(`Failed: ${error.message}`); return false }
      toast.success('Role updated.')
      invalidateCache()
      await fetchProfiles(true)
      return true
    } catch {
      toast.error('Database connection failed.')
      return false
    }
  }

  const teamLeads    = profiles.filter((p) => p.role === 'team_lead')
  const agents       = profiles.filter((p) => p.role === 'agent')
  const pendingUsers = profiles.filter((p) => p.status === 'pending')

  return {
    profiles, teamLeads, agents, pendingUsers,
    loading, dbError,
    approveUser, updateRole,
    refetch: () => fetchProfiles(true),
  }
}
