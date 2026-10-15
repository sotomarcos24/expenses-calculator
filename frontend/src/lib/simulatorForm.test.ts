import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client.ts'
import {
  expensesAreZero,
  initialFormValues,
  percentToRatio,
  ratioToPercent,
  simulatorServerErrors,
  validateSimulatorForm,
  withdrawalRequest,
  type SimulatorFormValues,
} from './simulatorForm.ts'

function valid(over: Partial<SimulatorFormValues> = {}): SimulatorFormValues {
  return {
    ...initialFormValues({
      starting_amount: '10000.00',
      avg_monthly_expenses: '2000.00',
      inflation_rate: '0.02',
      scenarios: { pessimistic: '0.03', base: '0.05', optimistic: '0.07' },
    }),
    current_age: '30',
    horizon_years: '10',
    target_amount: '50000',
    years: '10',
    retirement_age: '65',
    withdrawal_rate: '4',
    ...over,
  }
}

describe('percent conversion', () => {
  it.each([
    ['5', '0.05'],
    ['2.5', '0.025'],
    ['0', '0'],
    ['-1', '-0.01'],
    ['0.0001', '0.000001'],
    ['50', '0.5'],
    [' 12.3456 ', '0.123456'],
  ])('percentToRatio(%s) = %s', (percent, ratio) => {
    expect(percentToRatio(percent)).toBe(ratio)
  })

  it.each([
    ['0.05', '5'],
    ['0.025', '2.5'],
    ['0', '0'],
    ['0.02', '2'],
    ['-0.01', '-1'],
    ['0.123456', '12.3456'],
    ['0.5', '50'],
  ])('ratioToPercent(%s) = %s', (ratio, percent) => {
    expect(ratioToPercent(ratio)).toBe(percent)
  })
})

describe('validateSimulatorForm', () => {
  it('accepts valid values in every mode', () => {
    expect(validateSimulatorForm('accumulation', valid())).toEqual({})
    expect(validateSimulatorForm('goal', valid())).toEqual({})
    expect(validateSimulatorForm('withdrawal', valid())).toEqual({})
  })

  it('checks ranges', () => {
    const errors = validateSimulatorForm(
      'accumulation',
      valid({ rate_base: '60', horizon_years: '61', current_age: '121', contribution: '-1' }),
    )
    expect(errors.rate_base).toBe('Base return must be between -50 and 50')
    expect(errors.horizon_years).toBe('Horizon must be between 1 and 60')
    expect(errors.current_age).toBe('Current age must be between 0 and 120')
    expect(errors.contribution).toBe('Contribution cannot be negative')
  })

  it('does not validate fields of other tabs', () => {
    expect(validateSimulatorForm('goal', valid({ current_age: '', horizon_years: '' }))).toEqual({})
  })

  it('checks the withdrawal ages and the matching withdrawal field', () => {
    expect(
      validateSimulatorForm('withdrawal', valid({ retirement_age: '30' })).retirement_age,
    ).toBe('Retirement age must be greater than your current age')
    expect(
      validateSimulatorForm('withdrawal', valid({ retirement_age: '95' })).retirement_age,
    ).toBe('Retirement age must be at most 60 years after your current age')
    expect(validateSimulatorForm('withdrawal', valid({ end_age: '65' })).end_age).toBe(
      'End age must be greater than the retirement age',
    )
    expect(
      validateSimulatorForm('withdrawal', valid({ withdrawal_rate: '' })).withdrawal_rate,
    ).toBe('Withdrawal rate is required')
    expect(
      validateSimulatorForm('withdrawal', valid({ withdrawal_mode: 'fixed' })).monthly_withdrawal,
    ).toBe('Monthly withdrawal is required')
  })
})

describe('withdrawalRequest', () => {
  it('sends only the matching withdrawal field', () => {
    const fixed = withdrawalRequest(valid({ withdrawal_mode: 'fixed', monthly_withdrawal: '2500' }))
    expect(fixed.withdrawal_rate).toBeNull()
    expect(fixed.monthly_withdrawal).toBe('2500')
  })
})

describe('expensesAreZero', () => {
  it('is true only for a typed zero', () => {
    expect(expensesAreZero('0')).toBe(true)
    expect(expensesAreZero('0.00')).toBe(true)
    expect(expensesAreZero('')).toBe(false)
    expect(expensesAreZero('10')).toBe(false)
  })
})

describe('simulatorServerErrors', () => {
  const detail = [
    { loc: ['body', 'inflation_rate'], msg: 'Value error, too high' },
    { loc: ['body', 'scenarios', 'optimistic'], msg: 'bad rate' },
  ]

  it('maps 422 items to fields', () => {
    expect(simulatorServerErrors(new ApiError(422, detail), 'accumulation')).toEqual({
      fields: { inflation_rate: 'too high', rate_optimistic: 'bad rate' },
      form: null,
    })
  })

  it('uses a form-level message for fields not on the tab or non-field errors', () => {
    expect(
      simulatorServerErrors(new ApiError(422, [{ loc: ['body', 'current_age'], msg: 'x' }]), 'goal')
        .form,
    ).toBe('Something went wrong. Please try again.')
    expect(simulatorServerErrors(new ApiError(500, null), 'goal').form).toBe(
      'Something went wrong. Please try again.',
    )
    expect(simulatorServerErrors(new ApiError(422, 'Plain detail'), 'goal').form).toBe(
      'Plain detail',
    )
  })

  it('keeps mapped fields and adds a form message when only some items map', () => {
    const result = simulatorServerErrors(
      new ApiError(422, [...detail, { loc: ['body'], msg: 'x' }]),
      'accumulation',
    )
    expect(Object.keys(result.fields)).toHaveLength(2)
    expect(result.form).toBe('Some fields are invalid. Please check the form.')
  })
})
