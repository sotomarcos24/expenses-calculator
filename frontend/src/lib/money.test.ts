import { describe, expect, it } from 'vitest'
import { deductionRate, parseMoney } from './money.ts'

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
