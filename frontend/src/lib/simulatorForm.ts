import { z } from 'zod'
import { ApiError } from '../api/client.ts'
import type {
  AccumulationRequest,
  Frequency,
  GoalRequest,
  SimulatorDefaults,
  WithdrawalMode,
  WithdrawalRequest,
} from '../api/types.ts'
import { GENERIC_ERROR } from './authErrors.ts'
import { parseMoney } from './money.ts'

export type SimulatorMode = 'accumulation' | 'goal' | 'withdrawal'

/** Raw values of the simulator form: every input is a string (rates as percentages, e.g. `5`). */
export type SimulatorFormValues = {
  starting_amount: string
  contribution: string
  frequency: Frequency
  rate_pessimistic: string
  rate_base: string
  rate_optimistic: string
  inflation_rate: string
  current_age: string
  avg_monthly_expenses: string
  horizon_years: string
  target_amount: string
  years: string
  target_is_real: boolean
  retirement_age: string
  end_age: string
  withdrawal_mode: WithdrawalMode
  withdrawal_rate: string
  monthly_withdrawal: string
}

export type SimulatorField = keyof SimulatorFormValues

/** Fields shown (and validated) on each tab. */
export const MODE_FIELDS: Record<SimulatorMode, readonly SimulatorField[]> = {
  accumulation: [
    'starting_amount',
    'contribution',
    'frequency',
    'horizon_years',
    'rate_pessimistic',
    'rate_base',
    'rate_optimistic',
    'inflation_rate',
    'current_age',
    'avg_monthly_expenses',
  ],
  goal: [
    'starting_amount',
    'target_amount',
    'years',
    'target_is_real',
    'frequency',
    'rate_pessimistic',
    'rate_base',
    'rate_optimistic',
    'inflation_rate',
  ],
  withdrawal: [
    'starting_amount',
    'contribution',
    'frequency',
    'rate_pessimistic',
    'rate_base',
    'rate_optimistic',
    'inflation_rate',
    'current_age',
    'avg_monthly_expenses',
    'retirement_age',
    'end_age',
    'withdrawal_mode',
    'withdrawal_rate',
    'monthly_withdrawal',
  ],
}

// --- Percentages (kept as strings: "5" ⇄ "0.05", never converted through `number`) ---------------

/** Percent-to-ratio scale: a ratio has at most 6 decimals, so a percentage has at most 4. */
const PERCENT_PATTERN = /^([-+]?)(\d+)(?:\.(\d{1,4}))?$/
const PERCENT_SCALE = 10_000n

/** `"5"` / `"-2.5"` → percentage in units of 0.0001 %, or an error key. */
function parsePercent(input: string): { ok: true; scaled: bigint } | { ok: false; error: string } {
  const value = input.trim()
  if (value === '') {
    return { ok: false, error: 'required' }
  }
  if (/^[-+]?\d+\.\d{5,}$/.test(value)) {
    return { ok: false, error: 'decimals' }
  }
  const match = PERCENT_PATTERN.exec(value)
  if (match === null) {
    return { ok: false, error: 'format' }
  }
  const magnitude = BigInt(match[2]) * PERCENT_SCALE + BigInt((match[3] ?? '').padEnd(4, '0'))
  return { ok: true, scaled: match[1] === '-' ? -magnitude : magnitude }
}

/** Percentage typed by the user → decimal ratio string for the API: `"5"` → `"0.05"`. */
export function percentToRatio(input: string): string {
  const parsed = parsePercent(input)
  if (!parsed.ok) {
    throw new Error(`Invalid percentage: ${input}`)
  }
  const negative = parsed.scaled < 0n
  const magnitude = negative ? -parsed.scaled : parsed.scaled
  const ratioScale = 1_000_000n
  const whole = magnitude / ratioScale
  const fraction = (magnitude % ratioScale).toString().padStart(6, '0').replace(/0+$/, '')
  const text = fraction === '' ? `${whole}` : `${whole}.${fraction}`
  return negative && magnitude !== 0n ? `-${text}` : text
}

/** Ratio from the API → percentage for the form: `"0.05"` → `"5"`, `"0.025"` → `"2.5"`. */
export function ratioToPercent(ratio: string): string {
  const match = /^([-+]?)(\d+)(?:\.(\d+))?$/.exec(ratio.trim())
  if (match === null) {
    return ''
  }
  const fraction = (match[3] ?? '').padEnd(2, '0')
  const whole = `${match[2]}${fraction.slice(0, 2)}`.replace(/^0+(?=\d)/, '')
  const rest = fraction.slice(2).replace(/0+$/, '')
  const text = rest === '' ? whole : `${whole}.${rest}`
  return match[1] === '-' && /[1-9]/.test(text) ? `-${text}` : text
}

// --- Validation ----------------------------------------------------------------------------------

const MAX_SIMULATOR_CENTS = 100_000_000_000_000n // 1,000,000,000,000.00
const MAX_YEARS = 60
const MAX_AGE = 120

function moneyField(label: string) {
  return z.string().superRefine((value, ctx) => {
    const parsed = parseMoney(value, { allowZero: true, maxCents: MAX_SIMULATOR_CENTS })
    if (parsed.ok) {
      return
    }
    const messages = {
      required: `${label} is required`,
      'not-positive': `${label} cannot be negative`,
      negative: `${label} cannot be negative`,
      'too-many-decimals': 'Use at most 2 decimal places',
      'too-large': `${label} must be at most 1,000,000,000,000`,
      format: 'Enter a valid amount, e.g. 1234.50',
    } as const
    ctx.addIssue({ code: 'custom', message: messages[parsed.error] })
  })
}

function percentField(label: string, min: number, max: number) {
  return z.string().superRefine((value, ctx) => {
    const parsed = parsePercent(value)
    let message: string | null = null
    if (!parsed.ok) {
      message =
        parsed.error === 'required'
          ? `${label} is required`
          : parsed.error === 'decimals'
            ? 'Use at most 4 decimal places'
            : 'Enter a valid percentage, e.g. 5 or 2.5'
    } else if (
      parsed.scaled < BigInt(min) * PERCENT_SCALE ||
      parsed.scaled > BigInt(max) * PERCENT_SCALE
    ) {
      message = `${label} must be between ${min} and ${max}`
    }
    if (message !== null) {
      ctx.addIssue({ code: 'custom', message })
    }
  })
}

function integerField(label: string, min: number, max: number) {
  return z.string().superRefine((value, ctx) => {
    const text = value.trim()
    let message: string | null = null
    if (text === '') {
      message = `${label} is required`
    } else if (!/^\d+$/.test(text)) {
      message = `${label} must be a whole number`
    } else if (Number(text) < min || Number(text) > max) {
      message = `${label} must be between ${min} and ${max}`
    }
    if (message !== null) {
      ctx.addIssue({ code: 'custom', message })
    }
  })
}

const shared = {
  starting_amount: moneyField('Starting amount'),
  rate_pessimistic: percentField('Pessimistic return', -50, 50),
  rate_base: percentField('Base return', -50, 50),
  rate_optimistic: percentField('Optimistic return', -50, 50),
  inflation_rate: percentField('Inflation', -50, 50),
}

const frequency = z.enum(['weekly', 'monthly', 'yearly'])

const ageShape = {
  contribution: moneyField('Contribution'),
  frequency,
  current_age: integerField('Current age', 0, MAX_AGE),
  avg_monthly_expenses: moneyField('Average monthly expenses'),
}

const accumulationSchema = z.object({
  ...shared,
  ...ageShape,
  horizon_years: integerField('Horizon', 1, MAX_YEARS),
})

const goalSchema = z.object({
  ...shared,
  frequency,
  target_amount: moneyField('Target amount'),
  years: integerField('Years', 1, MAX_YEARS),
  target_is_real: z.boolean(),
})

const withdrawalSchema = z
  .object({
    ...shared,
    ...ageShape,
    retirement_age: integerField('Retirement age', 0, MAX_AGE),
    end_age: integerField('End age', 0, MAX_AGE),
    withdrawal_mode: z.enum(['percent', 'fixed']),
    withdrawal_rate: z.string(),
    monthly_withdrawal: z.string(),
  })
  .superRefine((values, ctx) => {
    const current = /^\d+$/.test(values.current_age.trim()) ? Number(values.current_age) : null
    const retirement = /^\d+$/.test(values.retirement_age.trim())
      ? Number(values.retirement_age)
      : null
    const end = /^\d+$/.test(values.end_age.trim()) ? Number(values.end_age) : null
    const fail = (path: SimulatorField, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })

    if (current !== null && retirement !== null && !(retirement > current)) {
      fail('retirement_age', 'Retirement age must be greater than your current age')
    } else if (current !== null && retirement !== null && retirement - current > MAX_YEARS) {
      fail(
        'retirement_age',
        `Retirement age must be at most ${MAX_YEARS} years after your current age`,
      )
    }
    if (retirement !== null && end !== null && !(end > retirement)) {
      fail('end_age', 'End age must be greater than the retirement age')
    }
    if (values.withdrawal_mode === 'percent') {
      const result = percentField('Withdrawal rate', 0, 50).safeParse(values.withdrawal_rate)
      if (!result.success) {
        fail('withdrawal_rate', result.error.issues[0].message)
      }
    } else {
      const result = moneyField('Monthly withdrawal').safeParse(values.monthly_withdrawal)
      if (!result.success) {
        fail('monthly_withdrawal', result.error.issues[0].message)
      }
    }
  })

const SCHEMAS = {
  accumulation: accumulationSchema,
  goal: goalSchema,
  withdrawal: withdrawalSchema,
} as const

export type FieldErrors = Partial<Record<SimulatorField, string>>

/** Client-side validation of the fields of `mode`: the first message per field. */
export function validateSimulatorForm(mode: SimulatorMode, values: SimulatorFormValues) {
  const result = SCHEMAS[mode].safeParse(values)
  const errors: FieldErrors = {}
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as SimulatorField
      errors[field] ??= issue.message
    }
  }
  return errors
}

// --- Defaults and request bodies -----------------------------------------------------------------

/** Initial form values; `defaults` (from `GET /simulator/defaults`) is `undefined` when it failed. */
export function initialFormValues(defaults: SimulatorDefaults | undefined): SimulatorFormValues {
  return {
    starting_amount: defaults?.starting_amount ?? '',
    contribution: '0',
    frequency: 'monthly',
    rate_pessimistic: defaults ? ratioToPercent(defaults.scenarios.pessimistic) : '',
    rate_base: defaults ? ratioToPercent(defaults.scenarios.base) : '',
    rate_optimistic: defaults ? ratioToPercent(defaults.scenarios.optimistic) : '',
    inflation_rate: defaults ? ratioToPercent(defaults.inflation_rate) : '',
    current_age: '',
    avg_monthly_expenses: defaults?.avg_monthly_expenses ?? '',
    horizon_years: '',
    target_amount: '',
    years: '',
    target_is_real: true,
    retirement_age: '',
    end_age: '100',
    withdrawal_mode: 'percent',
    withdrawal_rate: '',
    monthly_withdrawal: '',
  }
}

function scenarios(values: SimulatorFormValues) {
  return {
    pessimistic: percentToRatio(values.rate_pessimistic),
    base: percentToRatio(values.rate_base),
    optimistic: percentToRatio(values.rate_optimistic),
  }
}

const money = (value: string) => value.trim()

/** Request bodies: money as trimmed strings, rates as decimal-ratio strings, ages as integers. */
export function accumulationRequest(values: SimulatorFormValues): AccumulationRequest {
  return {
    starting_amount: money(values.starting_amount),
    contribution: money(values.contribution),
    frequency: values.frequency,
    horizon_years: Number(values.horizon_years),
    scenarios: scenarios(values),
    inflation_rate: percentToRatio(values.inflation_rate),
    current_age: Number(values.current_age),
    avg_monthly_expenses: money(values.avg_monthly_expenses),
  }
}

export function goalRequest(values: SimulatorFormValues): GoalRequest {
  return {
    starting_amount: money(values.starting_amount),
    target_amount: money(values.target_amount),
    years: Number(values.years),
    frequency: values.frequency,
    scenarios: scenarios(values),
    inflation_rate: percentToRatio(values.inflation_rate),
    target_is_real: values.target_is_real,
  }
}

export function withdrawalRequest(values: SimulatorFormValues): WithdrawalRequest {
  const percent = values.withdrawal_mode === 'percent'
  return {
    starting_amount: money(values.starting_amount),
    contribution: money(values.contribution),
    frequency: values.frequency,
    scenarios: scenarios(values),
    inflation_rate: percentToRatio(values.inflation_rate),
    current_age: Number(values.current_age),
    avg_monthly_expenses: money(values.avg_monthly_expenses),
    retirement_age: Number(values.retirement_age),
    end_age: Number(values.end_age),
    withdrawal_mode: values.withdrawal_mode,
    withdrawal_rate: percent ? percentToRatio(values.withdrawal_rate) : null,
    monthly_withdrawal: percent ? null : money(values.monthly_withdrawal),
  }
}

/** True when the typed average monthly expenses are `0` (the hint and "—" results apply). */
export function expensesAreZero(input: string): boolean {
  const parsed = parseMoney(input, { allowZero: true, maxCents: MAX_SIMULATOR_CENTS })
  return parsed.ok && parsed.cents === 0n
}

// --- Server errors -------------------------------------------------------------------------------

/** API field names (`loc[1]`, or `loc[2]` under `scenarios`) → form fields. */
function fieldFromLoc(loc: unknown): SimulatorField | null {
  if (!Array.isArray(loc) || loc[0] !== 'body') {
    return null
  }
  const [, first, second] = loc as unknown[]
  if (first === 'scenarios' && typeof second === 'string') {
    return `rate_${second}` in initialFormValues(undefined)
      ? (`rate_${second}` as SimulatorField)
      : null
  }
  return typeof first === 'string' && first in initialFormValues(undefined)
    ? (first as SimulatorField)
    : null
}

export type ServerErrors = { fields: FieldErrors; form: string | null }

/**
 * Maps a failed simulator request: 422 items that point at a field shown on the current tab go
 * next to that field (the API's message, without pydantic's "Value error, " prefix); anything
 * else becomes one form-level message.
 */
export function simulatorServerErrors(error: unknown, mode: SimulatorMode): ServerErrors {
  const visible = new Set<SimulatorField>(MODE_FIELDS[mode])
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: GENERIC_ERROR }
  }
  if (error.status === 422 && typeof error.detail === 'string' && error.detail) {
    return { fields: {}, form: error.detail }
  }
  if (error.status !== 422 || !Array.isArray(error.detail)) {
    return { fields: {}, form: GENERIC_ERROR }
  }
  const fields: FieldErrors = {}
  let unmapped = false
  for (const item of error.detail as { loc?: unknown; msg?: unknown }[]) {
    const field = fieldFromLoc(item?.loc)
    const message = typeof item?.msg === 'string' ? item.msg.replace(/^Value error, /, '') : null
    if (field !== null && visible.has(field) && message) {
      fields[field] ??= message
    } else {
      unmapped = true
    }
  }
  const mapped = Object.keys(fields).length > 0
  return {
    fields,
    form: unmapped
      ? mapped
        ? 'Some fields are invalid. Please check the form.'
        : GENERIC_ERROR
      : null,
  }
}
