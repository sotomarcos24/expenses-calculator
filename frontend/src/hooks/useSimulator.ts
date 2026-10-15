import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client.ts'
import type {
  AccumulationRequest,
  AccumulationResponse,
  GoalRequest,
  GoalResponse,
  SimulatorDefaults,
  WithdrawalRequest,
  WithdrawalResponse,
} from '../api/types.ts'

export const SIMULATOR_DEFAULTS_QUERY_KEY = ['simulator', 'defaults'] as const

/** `GET /api/simulator/defaults`: portfolio value, average expenses, inflation and rates. */
export function useSimulatorDefaults() {
  return useQuery({
    queryKey: SIMULATOR_DEFAULTS_QUERY_KEY,
    queryFn: () => apiFetch<SimulatorDefaults>('/simulator/defaults'),
    // The form is pre-filled once; a failure shows an empty form instead of retrying for seconds.
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/** `POST /api/simulator/accumulation` (Mode A). The server does all the maths. */
export function useAccumulation() {
  return useMutation({
    mutationFn: (body: AccumulationRequest) =>
      apiFetch<AccumulationResponse>('/simulator/accumulation', { method: 'POST', body }),
  })
}

/** `POST /api/simulator/goal` (Mode B). */
export function useGoal() {
  return useMutation({
    mutationFn: (body: GoalRequest) =>
      apiFetch<GoalResponse>('/simulator/goal', { method: 'POST', body }),
  })
}

/** `POST /api/simulator/withdrawal` (Mode C). */
export function useWithdrawal() {
  return useMutation({
    mutationFn: (body: WithdrawalRequest) =>
      apiFetch<WithdrawalResponse>('/simulator/withdrawal', { method: 'POST', body }),
  })
}
