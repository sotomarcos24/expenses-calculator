/**
 * Money input helpers. Amounts are handled as integer cents in `bigint`, never as `number`, so no
 * float rounding can change what the user typed (AGENTS.md: no float for money). Only
 * `formatCurrency` / `formatPercent` convert to `number`, for display.
 */

/** Largest amount accepted by the API (`NUMERIC(12, 2)`): 9,999,999,999.99. */
export const MAX_MONEY_CENTS = 999_999_999_999n

/** Largest investment amount accepted by the API (`NUMERIC(14, 2)`): 999,999,999,999.99. */
export const MAX_INVESTMENT_MONEY_CENTS = 99_999_999_999_999n

export type MoneyError =
  'required' | 'not-positive' | 'negative' | 'too-many-decimals' | 'too-large' | 'format'

export type MoneyOptions = {
  /**
   * Accept `0` (investments). A leading minus is then reported as `negative` instead of
   * `not-positive`. Defaults to `false` (transactions: the amount must be greater than 0).
   */
  allowZero?: boolean
  /** Largest accepted amount in cents. Defaults to `MAX_MONEY_CENTS`. */
  maxCents?: bigint
}

export type MoneyResult = { ok: true; cents: bigint } | { ok: false; error: MoneyError }

const MONEY_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/
const TOO_MANY_DECIMALS_PATTERN = /^\d+\.\d{3,}$/

/**
 * Parses a user-typed amount (`"10"`, `"10.5"`, `"0012.30"`) into integer cents. The input is
 * trimmed first. Thousands separators, exponents, signs and bare dots are rejected. By default the
 * amount must be greater than 0 and at most `MAX_MONEY_CENTS` (see `MoneyOptions`).
 */
export function parseMoney(input: string, options: MoneyOptions = {}): MoneyResult {
  const { allowZero = false, maxCents = MAX_MONEY_CENTS } = options
  const value = input.trim()
  if (value === '') {
    return { ok: false, error: 'required' }
  }
  if (value.startsWith('-')) {
    return { ok: false, error: allowZero ? 'negative' : 'not-positive' }
  }
  if (TOO_MANY_DECIMALS_PATTERN.test(value)) {
    return { ok: false, error: 'too-many-decimals' }
  }
  const match = MONEY_PATTERN.exec(value)
  if (match === null) {
    return { ok: false, error: 'format' }
  }
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
  if (cents === 0n && !allowZero) {
    return { ok: false, error: 'not-positive' }
  }
  if (cents > maxCents) {
    return { ok: false, error: 'too-large' }
  }
  return { ok: true, cents }
}

/**
 * Parses an investment amount (amount invested, current value): `0` is valid, a negative value is
 * `negative`, and the maximum is `MAX_INVESTMENT_MONEY_CENTS`.
 */
export function parseInvestmentMoney(input: string): MoneyResult {
  return parseMoney(input, { allowZero: true, maxCents: MAX_INVESTMENT_MONEY_CENTS })
}

const RATE_SCALE = 10_000n

/**
 * Effective deduction rate `(gross − net) / gross` as a 4-decimal fraction string (`"0.2000"`),
 * rounded half up (away from zero) exactly like the API (`compute_deduction_rate` in
 * `backend/app/services/transactions.py`). `grossCents` must be positive.
 */
export function deductionRate(grossCents: bigint, netCents: bigint): string {
  const numerator = (grossCents - netCents) * RATE_SCALE
  const negative = numerator < 0n
  const absolute = negative ? -numerator : numerator
  let scaled = absolute / grossCents
  if ((absolute % grossCents) * 2n >= grossCents) {
    scaled += 1n
  }
  const whole = scaled / RATE_SCALE
  const fraction = (scaled % RATE_SCALE).toString().padStart(4, '0')
  return `${negative && scaled !== 0n ? '-' : ''}${whole}.${fraction}`
}
