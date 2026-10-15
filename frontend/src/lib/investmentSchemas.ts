import { z } from 'zod'
import type { InvestmentRead, InvestmentType } from '../api/types.ts'
import { INVESTMENT_TYPE_LABELS } from './investmentTypes.ts'
import { parseInvestmentMoney, type MoneyError } from './money.ts'
import { todayLocalIso } from './periods.ts'
import { MONEY_FORMAT, TOO_MANY_DECIMALS } from './transactionSchemas.ts'

/** Limits mirrored from `backend/app/schemas/investments.py`. */
export const NAME_MAX_LENGTH = 100
export const PLATFORM_MAX_LENGTH = 100

export const NAME_REQUIRED = 'Name is required'
export const NAME_TOO_LONG = `Name must be at most ${NAME_MAX_LENGTH} characters`
export const TYPE_REQUIRED = 'Select a type'
export const PLATFORM_TOO_LONG = `Platform must be at most ${PLATFORM_MAX_LENGTH} characters`
export const LAST_UPDATE_REQUIRED = 'Last update is required'

/**
 * Message for an investment money field parsed with `parseInvestmentMoney` (`label` is
 * "Amount invested" or "Current value").
 */
export function investmentMoneyErrorMessage(label: string, error: MoneyError): string {
  switch (error) {
    case 'required':
      return `${label} is required`
    case 'negative':
    case 'not-positive':
      return `${label} cannot be negative`
    case 'too-many-decimals':
      return TOO_MANY_DECIMALS
    case 'too-large':
      return `${label} must be at most 999,999,999,999.99`
    case 'format':
      return MONEY_FORMAT
  }
}

/** Raw values of the create / edit form: every input is a string. */
export type InvestmentFormInput = {
  name: string
  /** Investment type, or empty while "Select a type" is selected. */
  type: InvestmentType | ''
  /** Optional; empty means "no platform". */
  platform: string
  amount_invested: string
  current_value: string
  /** `YYYY-MM-DD` from the date input. */
  value_updated_at: string
}

/**
 * Body sent by the form, on both `POST` and `PATCH` (every field, so an edit can clear the
 * platform). Money stays a decimal string, exactly as typed (trimmed).
 */
export type InvestmentPayload = {
  name: string
  type: InvestmentType
  platform: string | null
  amount_invested: string
  current_value: string
  value_updated_at: string
}

/** Length in code points, as the API counts it (Python `len`). */
function length(text: string) {
  return [...text].length
}

const TYPE_VALUES = Object.keys(INVESTMENT_TYPE_LABELS) as [InvestmentType, ...InvestmentType[]]

/**
 * Validates the form values with the same rules as the API, then turns them into the request
 * body: trimmed name, `null` platform when empty, trimmed money strings. Amounts are checked in
 * `bigint` cents, never as floats.
 */
export const investmentFormSchema = z
  .object({
    name: z.string(),
    type: z.union([z.enum(TYPE_VALUES), z.literal('')]),
    platform: z.string(),
    amount_invested: z.string(),
    current_value: z.string(),
    value_updated_at: z.string(),
  })
  .superRefine((values, context) => {
    const issue = (path: keyof InvestmentFormInput, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message })

    const name = values.name.trim()
    if (name === '') {
      issue('name', NAME_REQUIRED)
    } else if (length(name) > NAME_MAX_LENGTH) {
      issue('name', NAME_TOO_LONG)
    }
    if (values.type === '') {
      issue('type', TYPE_REQUIRED)
    }
    if (length(values.platform.trim()) > PLATFORM_MAX_LENGTH) {
      issue('platform', PLATFORM_TOO_LONG)
    }
    const invested = parseInvestmentMoney(values.amount_invested)
    if (!invested.ok) {
      issue('amount_invested', investmentMoneyErrorMessage('Amount invested', invested.error))
    }
    const current = parseInvestmentMoney(values.current_value)
    if (!current.ok) {
      issue('current_value', investmentMoneyErrorMessage('Current value', current.error))
    }
    if (values.value_updated_at.trim() === '') {
      issue('value_updated_at', LAST_UPDATE_REQUIRED)
    }
  })
  .transform((values): InvestmentPayload => {
    const platform = values.platform.trim()
    return {
      name: values.name.trim(),
      // `superRefine` already rejected an empty type.
      type: values.type as InvestmentType,
      platform: platform === '' ? null : platform,
      amount_invested: values.amount_invested.trim(),
      current_value: values.current_value.trim(),
      value_updated_at: values.value_updated_at,
    }
  })

/** Empty form for a new investment: no type selected, last update today (local calendar date). */
export function emptyInvestmentForm(): InvestmentFormInput {
  return {
    name: '',
    type: '',
    platform: '',
    amount_invested: '',
    current_value: '',
    value_updated_at: todayLocalIso(),
  }
}

/** Form values of an existing row, as returned by the API (`"1000.00"`, `null` platform → empty). */
export function investmentToForm(investment: InvestmentRead): InvestmentFormInput {
  return {
    name: investment.name,
    type: investment.type,
    platform: investment.platform ?? '',
    amount_invested: investment.amount_invested,
    current_value: investment.current_value,
    value_updated_at: investment.value_updated_at,
  }
}
