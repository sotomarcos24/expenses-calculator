import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client.ts'
import type { Dashboard } from '../api/types.ts'
import type { DashboardRange } from '../lib/dashboardPeriod.ts'

/** Prefix of every dashboard query key; the key also carries `from` / `to`. */
export const DASHBOARD_QUERY_KEY = ['dashboard'] as const

/** `GET /api/dashboard` for `range`; `null` disables the request (invalid custom range). */
export function useDashboard(range: DashboardRange | null) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEY, range?.from, range?.to],
    queryFn: () => apiFetch<Dashboard>(`/dashboard?from=${range!.from}&to=${range!.to}`),
    enabled: range !== null,
  })
}
