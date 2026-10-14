import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TransactionRead } from '../api/types.ts'
import {
  emptyTransactionForm,
  transactionFormSchema,
  transactionToForm,
  type TransactionFormInput,
} from './transactionSchemas.ts'

const VALID: TransactionFormInput = {
  type: 'expense',
  date: '2026-10-14',
  amount: '12.30',
  gross_amount: '',
  category_id: '1',
  subcategory_id: '2',
  note: '  weekly shop  ',
}

function errorsOf(values: Partial<TransactionFormInput>) {
  const result = transactionFormSchema.safeParse({ ...VALID, ...values })
  if (result.success) {
    return {}
  }
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]))
}

describe('transactionFormSchema', () => {
  it('turns valid values into the request body', () => {
    expect(transactionFormSchema.parse(VALID)).toEqual({
      type: 'expense',
      date: '2026-10-14',
      amount: '12.30',
      gross_amount: null,
      category_id: 1,
      subcategory_id: 2,
      note: 'weekly shop',
    })
  })

  it('keeps money as trimmed strings and sends the gross amount of an income', () => {
    expect(
      transactionFormSchema.parse({
        ...VALID,
        type: 'income',
        amount: ' 2400 ',
        gross_amount: ' 3000.00 ',
        category_id: '5',
        subcategory_id: '',
        note: '   ',
      }),
    ).toEqual({
      type: 'income',
      date: '2026-10-14',
      amount: '2400',
      gross_amount: '3000.00',
      category_id: 5,
      subcategory_id: null,
      note: null,
    })
  })

  it('ignores the gross amount of an expense', () => {
    expect(transactionFormSchema.parse({ ...VALID, gross_amount: 'abc' }).gross_amount).toBeNull()
  })

  it('sends null for an empty gross amount', () => {
    const body = transactionFormSchema.parse({ ...VALID, type: 'income', gross_amount: '  ' })
    expect(body.gross_amount).toBeNull()
  })

  it('accepts future dates and the largest amount', () => {
    expect(errorsOf({ date: '2027-10-14', amount: '9999999999.99' })).toEqual({})
  })

  it.each([
    ['', 'Amount is required'],
    ['0', 'Amount must be greater than 0'],
    ['-5', 'Amount must be greater than 0'],
    ['10.123', 'Use at most 2 decimal places'],
    ['10000000000', 'Amount must be at most 9,999,999,999.99'],
    ['abc', 'Enter an amount like 1234.56'],
  ])('amount %j → %s', (amount, message) => {
    expect(errorsOf({ amount })).toEqual({ amount: message })
  })

  it.each([
    ['0', 'Gross amount must be greater than 0'],
    ['-1', 'Gross amount must be greater than 0'],
    ['3000.001', 'Use at most 2 decimal places'],
    ['10000000000', 'Gross amount must be at most 9,999,999,999.99'],
    ['1,000', 'Enter an amount like 1234.56'],
    ['2000', 'Gross amount must be at least the amount'],
  ])('gross amount %j → %s', (gross_amount, message) => {
    expect(errorsOf({ type: 'income', amount: '2400', gross_amount })).toEqual({
      gross_amount: message,
    })
  })

  it('accepts a gross amount equal to the amount', () => {
    expect(errorsOf({ type: 'income', amount: '2400', gross_amount: '2400.00' })).toEqual({})
  })

  it('requires a date and a category', () => {
    expect(errorsOf({ date: '', category_id: '' })).toEqual({
      date: 'Date is required',
      category_id: 'Select a category',
    })
  })

  it('limits the trimmed note to 500 characters', () => {
    expect(errorsOf({ note: 'a'.repeat(501) })).toEqual({
      note: 'Note must be at most 500 characters',
    })
    expect(errorsOf({ note: `  ${'a'.repeat(500)}  ` })).toEqual({})
  })

  it('reports every invalid field at once', () => {
    expect(Object.keys(errorsOf({ date: '', amount: '', category_id: '' }))).toEqual([
      'date',
      'amount',
      'category_id',
    ])
  })
})

describe('form values', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 14, 23, 30, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts a new transaction as an expense dated today (local date)', () => {
    expect(emptyTransactionForm()).toEqual({
      type: 'expense',
      date: '2026-10-14',
      amount: '',
      gross_amount: '',
      category_id: '',
      subcategory_id: '',
      note: '',
    })
  })

  it('pre-fills an edit from the row as returned by the API', () => {
    const row: TransactionRead = {
      id: 3,
      type: 'income',
      date: '2026-10-01',
      amount: '2400.00',
      gross_amount: '3000.00',
      deduction_rate: '0.2000',
      category_id: 5,
      category_name: 'Salary',
      subcategory_id: null,
      subcategory_name: null,
      note: null,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    }
    expect(transactionToForm(row)).toEqual({
      type: 'income',
      date: '2026-10-01',
      amount: '2400.00',
      gross_amount: '3000.00',
      category_id: '5',
      subcategory_id: '',
      note: '',
    })
  })
})
