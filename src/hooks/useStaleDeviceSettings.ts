import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'

export interface StaleDeviceSettings {
  agentDays: number
  teamLeadDays: number
}

export const DEFAULT_STALE_DEVICE_SETTINGS: StaleDeviceSettings = {
  agentDays: 3,
  teamLeadDays: 14,
}

export const STALE_DEVICE_SETTINGS_QUERY_KEY = ['stale-device-settings'] as const

async function fetchSettings(): Promise<StaleDeviceSettings> {
  const { data, error } = await withTimeout(
    supabase
      .from('stale_device_settings')
      .select('agent_days,team_lead_days')
      .eq('id', 'default')
      .maybeSingle(),
    15_000,
  )

  if (error || !data) return DEFAULT_STALE_DEVICE_SETTINGS

  return {
    agentDays: data.agent_days,
    teamLeadDays: data.team_lead_days,
  }
}

export function useStaleDeviceSettings() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: STALE_DEVICE_SETTINGS_QUERY_KEY,
    queryFn: fetchSettings,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: DEFAULT_STALE_DEVICE_SETTINGS,
  })

  const mutation = useMutation({
    mutationFn: async ({ settings, userId }: { settings: StaleDeviceSettings; userId: string }) => {
      const { error } = await withTimeout(
        supabase.from('stale_device_settings').upsert({
          id: 'default',
          agent_days: settings.agentDays,
          team_lead_days: settings.teamLeadDays,
          updated_at: new Date().toISOString(),
          updated_by: userId,
        }),
        15_000,
      )
      if (error) throw error
      return settings
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(STALE_DEVICE_SETTINGS_QUERY_KEY, settings)
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  return {
    settings: query.data ?? DEFAULT_STALE_DEVICE_SETTINGS,
    loading: query.isLoading,
    saveSettings: mutation.mutateAsync,
    saving: mutation.isPending,
  }
}
