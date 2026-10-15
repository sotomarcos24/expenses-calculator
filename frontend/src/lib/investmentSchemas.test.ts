import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentRead } from '../api/types.ts'
import {
  emptyInvestmentForm,
  investmentFormSchema,
  investmentMoneyErrorMessage,
  investmentToForm,
  type InvestmentFormInput,
} from './investmentSchemas.ts'

const VALID: InvestmentFormInput = {
  name: '  ETF World  ',
  type: 'etf',
  platform: '  Broker X  ',
  amount_invested: ' 1000 ',
  current_value: '1150',
  value_updated_at: '2026-10-14',
}

function errorsOf(values: Partial<InvestmentFormInput>) {
  const result = investmentFormSchema.safeParse({ ...VALID, ...values })
  if (result.success) {
    return {}
  }
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))
}

describe('investmentFormSchema', () => {
  it('turns valid values into the request body', () => {
    expect(investmentFormSchema.parse(VALID)).toEqual({
      name: 'ETF World',
      type: 'etf',
      platform: 'Broker X',
      amount_invested: '1000',
      current_value: '1150',
      value_updated_at: '2026-10-14',
    })
  })

  it.each(['', '   '])('sends a %j platform as null', (platform) => {
    expect(investmentFormSchema.parse({ ...VALID, platform }).platform).toBeNull()
  })

  it('accepts 0 as amount invested and current value', () => {
    expect(errorsOf({ amount_invested: '0', current_value: '0.00' })).toEqual({})
  })

  it.each([
    [{ name: '' }, 'name', 'Name is required'],
    [{ name: '   ' }, 'name', 'Name is required'],
    [{ name: 'a'.repeat(101) }, 'name', 'Name must be at most 100 characters'],
    [{ type: '' as const }, 'type', 'Select a type'],
    [{ platform: 'p'.repeat(101) }, 'platform', 'Platform must be at most 100 characters'],
    [{ amount_invested: '' }, 'amount_invested', 'Amount invested is required'],
    [{ current_value: ' ' }, 'current_value', 'Current value is required'],
    [{ amount_invested: '-5' }, 'amount_invested', 'Amount invested cannot be negative'],
    [{ current_value: '-5' }, 'current_value', 'Current value cannot be negative'],
    [{ amount_invested: '1.234' }, 'amount_invested', 'Use at most 2 decimal places'],
    [{ current_value: 'abc' }, 'current_value', 'Enter an amount like 1234.56'],
    [{ current_value: '1,000' }, 'current_value', 'Enter an amount like 1234.56'],
    [{ current_value: '1e3' }, 'current_value', 'Enter an amount like 1234.56'],
    [{ current_value: '.5' }, 'current_value', 'Enter an amount like 1234.56'],
    [{ current_value: '1.' }, 'current_value', 'Enter an amount like 1234.56'],
    [
      { amount_invested: '1000000000000' },
      'amount_invested',
      'Amount invested must be at most 999,999,999,999.99',
    ],
    [
      { current_value: '1000000000000' },
      'current_value',
      'Current value must be at most 999,999,999,999.99',
    ],
    [{ value_updated_at: '' }, 'value_updated_at', 'Last update is required'],
  ])('rejects %j on %s', (values, field, message) => {
    expect(errorsOf(values)).toEqual({ [field]: message })
  })

  it('counts code points, like the API', () => {
    // 100 emoji are 200 UTF-16 code units but 100 code points.
    expect(errorsOf({ name: '😀'.repeat(100), platform: '😀'.repeat(100) })).toEqual({})
    expect(errorsOf({ name: '😀'.repeat(101) })).toEqual({
      name: 'Name must be at most 100 characters',
    })
  })

  it('accepts the maximum amount', () => {
    expect(errorsOf({ amount_invested: '999999999999.99' })).toEqual({})
  })
})

describe('investmentMoneyErrorMessage', () => {
  it('builds the message from the label', () => {
    expect(investmentMoneyErrorMessage('Current value', 'negative')).toBe(
      'Current value cannot be negative',
    )
  })
})

describe('emptyInvestmentForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 23, 30, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('has no type and today as the last update (local date)', () => {
    expect(emptyInvestmentForm()).toEqual({
      name: '',
      type: '',
      platform: '',
      amount_invested: '',
      current_value: '',
      value_updated_at: '2026-10-14',
    })
  })
})

describe('investmentToForm', () => {
  const row: InvestmentRead = {
    id: 7,
    name: 'ETF World',
    type: 'etf',
    platform: null,
    amount_invested: '1000.00',
    current_value: '1150.00',
    gain: '150.00',
    gain_pct: '0.1500',
    value_updated_at: '2026-10-01',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  }

  it('keeps the API strings and turns a null platform into an empty field', () => {
    expect(investmentToForm(row)).toEqual({
      name: 'ETF World',
      type: 'etf',
      platform: '',
      amount_invested: '1000.00',
      current_value: '1150.00',
      value_updated_at: '2026-10-01',
    })
    expect(investmentToForm({ ...row, platform: 'Broker X' }).platform).toBe('Broker X')
  })
})
