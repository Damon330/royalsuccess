import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { playAlertSound, primeAudioContext } from '../lib/saleSound'
import { logDbError } from '../lib/errorLog'
import type { Profile, Role } from '../types'
import toast from 'react-hot-toast'

const QUERY_TIMEOUT  = 12_000
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

export function useProfiles(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true
  const [profiles,   setProfiles]   = useState<Profile[]>(() => enabled ? getCached() ?? [] : [])
  const [loading,    setLoading]    = useState(() => enabled && getCached() === null)
  const [dbError,    setDbError]    = useState(false)
  const [dbErrorMsg, setDbErrorMsg] = useState<string | null>(null)
  const isFirstLoad  = useRef(true)
  // Unique channel name per hook instance — prevents Supabase from reusing an
  // already-subscribed channel when multiple components call useProfiles() simultaneously.
  const channelName = useMemo(() => `profiles-${Math.random().toString(36).slice(2)}`, [])

  const fetchProfiles = useCallback(async (force = false) => {
    if (!enabled) {
      setProfiles([])
      setLoading(false)
      return
    }

    const cached = getCached()
    if (cached && !force) { setProfiles(cached); setLoading(false); return }

    setLoading(true)
    setDbError(false)
    setDbErrorMsg(null)
    try {
      // SECURITY DEFINER RPC — bypasses RLS, is_admin() checked once inside the function.
      // Fixes "Database connection failed" caused by per-row RLS evaluation timeouts.
      const { data, error } = await withTimeout(
        supabase.rpc('admin_get_profiles'),
        QUERY_TIMEOUT,
      )
      if (error) throw error
      const rows = (data as Profile[] | null) ?? []
      setCache(rows)
      setProfiles(rows)
    } catch (err) {
      const e   = err as { message?: string; code?: string; details?: string }
      const msg = err instanceof Error ? err.message : e?.message ?? JSON.stringify(err)
      logDbError('useProfiles', msg, { code: e?.code, detail: e?.details })
      setDbErrorMsg(msg)
      setDbError(true)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setProfiles([])
      setLoading(false)
      return
    }

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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'profiles' }, (payload) => {
        const deletedId = (payload.old as { id?: string })?.id
        if (deletedId) {
          setProfiles((prev) => {
            const next = prev.filter((p) => p.id !== deletedId)
            setCache(next)
            return next
          })
        }
      })
      .subscribe()

    isFirstLoad.current = false
    document.addEventListener('click', primeAudioContext, { once: true })

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [enabled, fetchProfiles])

  async function approveUser(userId: string, role: Role, teamLeadId?: string) {
    try {
      const { error } = await withTimeout(
        supabase.rpc('admin_update_profile', {
          p_user_id:      userId,
          p_role:         role,
          p_team_lead_id: teamLeadId ?? null,
          p_status:       'active',
        }),
        MUTATE_TIMEOUT,
      )
      if (error) { toast.error(`Failed: ${error.message}`); return false }
      toast.success('User approved.')
      invalidateCache()
      fetchProfiles(true)
      return true
    } catch {
      toast.error('Approval failed — check connection.')
      return false
    }
  }

  async function deleteProfile(userId: string): Promise<boolean> {
    try {
      const { error: rpcErr } = await withTimeout(
        supabase.rpc('admin_delete_profile', { p_user_id: userId }),
        MUTATE_TIMEOUT,
      )

      if (rpcErr) {
        // RPC not deployed yet — fall back to sequential direct queries.
        // Run supabase/admin-delete-profile.sql for the atomic version.
        const isNotFound = rpcErr.code === '42883' || rpcErr.code === 'PGRST202'
        if (!isNotFound) throw rpcErr

        const { error: e1 } = await withTimeout(
          supabase.from('phones')
            .update({ status: 'in_stock', assigned_to: null, assigned_at: null })
            .eq('assigned_to', userId),
          MUTATE_TIMEOUT,
        )
        if (e1) throw e1

        const { error: e2 } = await withTimeout(
          supabase.from('profiles').update({ team_lead_id: null }).eq('team_lead_id', userId),
          MUTATE_TIMEOUT,
        )
        if (e2) throw e2

        const { error: e3 } = await withTimeout(
          supabase.from('profiles').delete().eq('id', userId),
          MUTATE_TIMEOUT,
        )
        if (e3) throw e3
      }

      setProfiles((prev) => {
        const next = prev.filter((p) => p.id !== userId)
        setCache(next)
        return next
      })
      invalidateCache()
      toast.success('User deleted.')
      return true
    } catch {
      toast.error('Failed to delete user.')
      return false
    }
  }

  async function updateRole(userId: string, role: Role, teamLeadId?: string | null) {
    try {
      const { error } = await withTimeout(
        supabase.rpc('admin_update_profile', {
          p_user_id:      userId,
          p_role:         role,
          p_team_lead_id: teamLeadId ?? null,
          p_status:       null,
        }),
        MUTATE_TIMEOUT,
      )
      if (error) { toast.error(`Failed: ${error.message}`); return false }
      toast.success('Role updated.')
      invalidateCache()
      fetchProfiles(true)
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
    loading, dbError, dbErrorMsg,
    approveUser, updateRole, deleteProfile,
    refetch: () => fetchProfiles(true),
  }
}
