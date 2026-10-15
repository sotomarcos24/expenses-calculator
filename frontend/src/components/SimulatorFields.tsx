import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import type { WithdrawalMode } from '../api/types.ts'
import {
  expensesAreZero,
  type SimulatorFormValues,
  type SimulatorMode,
} from '../lib/simulatorForm.ts'
import { SelectField } from './SelectField.tsx'
import { TextField } from './TextField.tsx'

type Props = {
  mode: SimulatorMode
  register: UseFormRegister<SimulatorFormValues>
  errors: FieldErrors<SimulatorFormValues>
  /** Current value of "Average monthly expenses", to show the hint when it is zero. */
  expenses: string
  /** Current "Withdrawal type", to show the matching field (Mode C). */
  withdrawalMode: WithdrawalMode
}

const EXPENSES_HINT =
  'Enter your average monthly expenses to see how long your savings would cover them.'

/** The inputs of one simulator tab. Values are kept by the parent form when tabs change. */
export function SimulatorFields({ mode, register, errors, expenses, withdrawalMode }: Props) {
  const err = (name: keyof SimulatorFormValues) => errors[name]?.message
  const percent = { inputMode: 'decimal', autoComplete: 'off' } as const
  const money = { inputMode: 'decimal', autoComplete: 'off' } as const
  const whole = { inputMode: 'numeric', autoComplete: 'off' } as const

  const frequency = (
    <SelectField label="Contribution frequency" error={err('frequency')} {...register('frequency')}>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
      <option value="yearly">Yearly</option>
    </SelectField>
  )
  const expensesField = (
    <TextField
      label="Average monthly expenses ($)"
      hint={expensesAreZero(expenses) ? EXPENSES_HINT : undefined}
      error={err('avg_monthly_expenses')}
      {...money}
      {...register('avg_monthly_expenses')}
    />
  )

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Starting amount ($)"
        error={err('starting_amount')}
        {...money}
        {...register('starting_amount')}
      />
      {mode !== 'goal' && (
        <TextField
          label="Contribution ($)"
          error={err('contribution')}
          {...money}
          {...register('contribution')}
        />
      )}
      {frequency}

      {mode === 'accumulation' && (
        <TextField
          label="Horizon (years)"
          error={err('horizon_years')}
          {...whole}
          {...register('horizon_years')}
        />
      )}
      {mode === 'goal' && (
        <>
          <TextField
            label="Target amount ($)"
            error={err('target_amount')}
            {...money}
            {...register('target_amount')}
          />
          <TextField
            label="Years to reach it"
            error={err('years')}
            {...whole}
            {...register('years')}
          />
          <div className="flex items-center gap-2 self-end pb-2 sm:col-span-2">
            <input
              id="target-is-real"
              type="checkbox"
              className="size-4 accent-primary"
              {...register('target_is_real')}
            />
            <label htmlFor="target-is-real" className="text-sm">
              Target is in today&rsquo;s dollars
            </label>
          </div>
        </>
      )}

      <TextField
        label="Pessimistic return (% per year)"
        error={err('rate_pessimistic')}
        {...percent}
        {...register('rate_pessimistic')}
      />
      <TextField
        label="Base return (% per year)"
        error={err('rate_base')}
        {...percent}
        {...register('rate_base')}
      />
      <TextField
        label="Optimistic return (% per year)"
        error={err('rate_optimistic')}
        {...percent}
        {...register('rate_optimistic')}
      />
      <TextField
        label="Inflation (% per year)"
        error={err('inflation_rate')}
        {...percent}
        {...register('inflation_rate')}
      />

      {mode !== 'goal' && (
        <>
          <TextField
            label="Current age"
            error={err('current_age')}
            {...whole}
            {...register('current_age')}
          />
          {expensesField}
        </>
      )}

      {mode === 'withdrawal' && (
        <>
          <TextField
            label="Retirement age"
            error={err('retirement_age')}
            {...whole}
            {...register('retirement_age')}
          />
          <TextField
            label="End age"
            hint="Age until which the money should last."
            error={err('end_age')}
            {...whole}
            {...register('end_age')}
          />
          <SelectField
            label="Withdrawal type"
            error={err('withdrawal_mode')}
            {...register('withdrawal_mode')}
          >
            <option value="percent">Percent of the balance per year</option>
            <option value="fixed">Fixed monthly amount</option>
          </SelectField>
          {withdrawalMode === 'percent' ? (
            <TextField
              label="Withdrawal rate (% of the balance per year)"
              error={err('withdrawal_rate')}
              {...percent}
              {...register('withdrawal_rate')}
            />
          ) : (
            <TextField
              label="Monthly withdrawal ($, in today's dollars)"
              error={err('monthly_withdrawal')}
              {...money}
              {...register('monthly_withdrawal')}
            />
          )}
        </>
      )}
    </div>
  )
}
