import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30 s — no re-fetch if another component
      // mounts and uses the same key within that window.
      staleTime: 30_000,
      // Keep unused cache entries for 5 min so navigating back is instant.
      gcTime: 5 * 60_000,
      // Two automatic retries with exponential back-off, capped at 10 s.
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 10_000),
      // Refetch silently when the user returns to the tab.
      refetchOnWindowFocus: true,
      refetchOnReconnect:   true,
    },
    mutations: {
      // Mutations never auto-retry — a duplicate phone insert would be wrong.
      retry: 0,
    },
  },
})
