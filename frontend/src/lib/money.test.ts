import { describe, expect, it } from 'vitest'
import {
  deductionRate,
  MAX_INVESTMENT_MONEY_CENTS,
  parseInvestmentMoney,
  parseMoney,
} from './money.ts'

describe('parseMoney', () => {
  it.each([
    ['10', 1000n],
    ['10.5', 1050n],
    ['10.50', 1050n],
    ['0012.30', 1230n],
    ['  12.30  ', 1230n],
    ['0.01', 1n],
    ['9999999999.99', 999_999_999_999n],
  ])('accepts %j as %s cents', (input, cents) => {
    expect(parseMoney(input)).toEqual({ ok: true, cents })
  })

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['0', 'not-positive'],
    ['0.00', 'not-positive'],
    ['-5', 'not-positive'],
    ['-0.5', 'not-positive'],
    ['10.123', 'too-many-decimals'],
    ['0.001', 'too-many-decimals'],
    ['10000000000', 'too-large'],
    ['10000000000.00', 'too-large'],
    ['1,234', 'format'],
    ['abc', 'format'],
    ['1e3', 'format'],
    ['10.', 'format'],
    ['.5', 'format'],
    ['+5', 'format'],
    ['1 000', 'format'],
  ])('rejects %j with %s', (input, error) => {
    expect(parseMoney(input)).toEqual({ ok: false, error })
  })
})

describe('deductionRate', () => {
  it.each([
    [300_000n, 240_000n, '0.2000'],
    [600n, 500n, '0.1667'],
    [10_000n, 10_000n, '0.0000'],
    [300_000n, 299_999n, '0.0000'],
    [800n, 799n, '0.0013'],
    [20_000n, 1n, '1.0000'],
  ])('gross %s / net %s → %s', (gross, net, rate) => {
    expect(deductionRate(gross, net)).toBe(rate)
  })

  it('rounds an exact half up', () => {
    // (20000 − 19999) / 20000 = 0.00005 → 0.0001
    expect(deductionRate(20_000n, 19_999n)).toBe('0.0001')
  })
})

describe('parseMoney options', () => {
  it('keeps the transaction rules by default', () => {
    expect(parseMoney('0')).toEqual({ ok: false, error: 'not-positive' })
    expect(parseMoney('-1')).toEqual({ ok: false, error: 'not-positive' })
    expect(parseMoney('10000000000')).toEqual({ ok: false, error: 'too-large' })
  })

  it('accepts 0 and reports a negative value with allowZero', () => {
    expect(parseMoney('0', { allowZero: true })).toEqual({ ok: true, cents: 0n })
    expect(parseMoney('-1', { allowZero: true })).toEqual({ ok: false, error: 'negative' })
  })

  it('uses maxCents as the limit', () => {
    expect(parseMoney('1.00', { maxCents: 100n })).toEqual({ ok: true, cents: 100n })
    expect(parseMoney('1.01', { maxCents: 100n })).toEqual({ ok: false, error: 'too-large' })
  })
})

describe('parseInvestmentMoney', () => {
  it('has the NUMERIC(14, 2) maximum', () => {
    expect(MAX_INVESTMENT_MONEY_CENTS).toBe(99_999_999_999_999n)
  })

  it.each([
    ['0', 0n],
    ['0.00', 0n],
    ['0.10', 10n],
    ['1150', 115_000n],
    ['  1000.5  ', 100_050n],
    ['999999999999.99', 99_999_999_999_999n],
  ])('accepts %j as %s cents', (input, cents) => {
    expect(parseInvestmentMoney(input)).toEqual({ ok: true, cents })
  })

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['-1', 'negative'],
    ['-0.5', 'negative'],
    ['1.234', 'too-many-decimals'],
    ['1000000000000', 'too-large'],
    ['999999999999.991', 'too-many-decimals'],
    ['abc', 'format'],
    ['1,000', 'format'],
    ['1e3', 'format'],
    ['.5', 'format'],
    ['1.', 'format'],
  ])('rejects %j with %s', (input, error) => {
    expect(parseInvestmentMoney(input)).toEqual({ ok: false, error })
  })
})
