import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Fresh for 60 s — no re-fetch if another component mounts within window.
      staleTime: 60_000,
      // Keep unused cache for 10 min so navigating back is instant.
      gcTime: 10 * 60_000,
      // One retry only, flat 400 ms delay — fail fast instead of waiting 3 s+.
      retry: 1,
      retryDelay: 400,
      refetchOnWindowFocus: false,
      refetchOnReconnect:   true,
    },
    mutations: {
      retry: 0,
    },
  },
})
