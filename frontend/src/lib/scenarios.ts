/** The three simulator scenarios and their theme-token colours (`src/index.css`). */
export const SCENARIOS = [
  { key: 'pessimistic', label: 'Pessimistic', color: 'var(--color-scenario-pessimistic)' },
  { key: 'base', label: 'Base', color: 'var(--color-scenario-base)' },
  { key: 'optimistic', label: 'Optimistic', color: 'var(--color-scenario-optimistic)' },
] as const

export type ScenarioKey = (typeof SCENARIOS)[number]['key']

export type ChartRow = { x: number } & Partial<Record<ScenarioKey, number>>
