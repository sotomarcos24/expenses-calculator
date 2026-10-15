import { useRef, useState, type KeyboardEvent } from 'react'
import { useForm, useWatch, type Resolver } from 'react-hook-form'
import type { SimulatorDefaults } from '../api/types.ts'
import { useAccumulation, useGoal, useWithdrawal } from '../hooks/useSimulator.ts'
import {
  accumulationRequest,
  goalRequest,
  initialFormValues,
  simulatorServerErrors,
  validateSimulatorForm,
  withdrawalRequest,
  type SimulatorFormValues,
  type SimulatorMode,
} from '../lib/simulatorForm.ts'
import type { Basis } from './BasisToggle.tsx'
import { Button } from './Button.tsx'
import { FormError } from './FormError.tsx'
import { SimulatorFields } from './SimulatorFields.tsx'
import { AccumulationResults, GoalResults, WithdrawalResults } from './SimulatorResults.tsx'

const TABS: { mode: SimulatorMode; label: string }[] = [
  { mode: 'accumulation', label: 'Accumulation — How much will I have?' },
  { mode: 'goal', label: 'Goal — How much do I need to save?' },
  { mode: 'withdrawal', label: 'Withdrawal — Can I retire?' },
]

/** Tabs A / B / C, the form of the active tab and its results. `defaults` pre-fills the form once. */
export function SimulatorWorkspace({ defaults }: { defaults: SimulatorDefaults | undefined }) {
  const [mode, setMode] = useState<SimulatorMode>('accumulation')
  const [basis, setBasis] = useState<Basis>('nominal')
  const [formError, setFormError] = useState<string | null>(null)
  const tabRefs = useRef<Record<SimulatorMode, HTMLButtonElement | null>>({
    accumulation: null,
    goal: null,
    withdrawal: null,
  })

  const accumulation = useAccumulation()
  const goal = useGoal()
  const withdrawal = useWithdrawal()

  const resolver: Resolver<SimulatorFormValues, { mode: SimulatorMode }> = (values, context) => {
    const fieldErrors = validateSimulatorForm(context?.mode ?? 'accumulation', values)
    const entries = Object.entries(fieldErrors)
    if (entries.length === 0) {
      return { values, errors: {} }
    }
    return {
      values: {},
      errors: Object.fromEntries(
        entries.map(([field, message]) => [field, { type: 'validate', message }]),
      ),
    }
  }

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<SimulatorFormValues, { mode: SimulatorMode }>({
    context: { mode },
    defaultValues: initialFormValues(defaults),
    resolver,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  const expenses = useWatch({ control, name: 'avg_monthly_expenses' })
  const withdrawalMode = useWatch({ control, name: 'withdrawal_mode' })
  const pending = accumulation.isPending || goal.isPending || withdrawal.isPending

  function selectMode(next: SimulatorMode) {
    if (next === mode) {
      return
    }
    setMode(next)
    setFormError(null)
    clearErrors()
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = TABS.length - 1
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % TABS.length
        : event.key === 'ArrowLeft'
          ? (index + last) % TABS.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (target === null) {
      return
    }
    event.preventDefault()
    selectMode(TABS[target].mode)
    tabRefs.current[TABS[target].mode]?.focus()
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      if (mode === 'accumulation') {
        await accumulation.mutateAsync(accumulationRequest(values))
      } else if (mode === 'goal') {
        await goal.mutateAsync(goalRequest(values))
      } else {
        await withdrawal.mutateAsync(withdrawalRequest(values))
      }
    } catch (error) {
      const server = simulatorServerErrors(error, mode)
      for (const [field, message] of Object.entries(server.fields)) {
        setError(field as keyof SimulatorFormValues, { type: 'server', message })
      }
      setFormError(server.form)
    }
  })

  return (
    <div>
      <div role="tablist" aria-label="Simulation mode" className="mb-4 grid gap-2 md:grid-cols-3">
        {TABS.map((tab, index) => {
          const selected = tab.mode === mode
          return (
            <button
              key={tab.mode}
              ref={(element) => {
                tabRefs.current[tab.mode] = element
              }}
              type="button"
              role="tab"
              id={`simulator-tab-${tab.mode}`}
              aria-selected={selected}
              aria-controls="simulator-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => selectMode(tab.mode)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              className={`rounded-lg border px-3 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary ${
                selected
                  ? 'border-primary bg-accent text-primary'
                  : 'border-border bg-background text-muted hover:bg-accent hover:text-primary'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id="simulator-panel"
        aria-labelledby={`simulator-tab-${mode}`}
        tabIndex={-1}
      >
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
          <SimulatorFields
            mode={mode}
            register={register}
            errors={errors}
            expenses={expenses}
            withdrawalMode={withdrawalMode}
          />
          <FormError message={formError ?? undefined} />
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? 'Running…' : 'Run simulation'}
          </Button>
        </form>

        {pending && (
          <p role="status" className="mt-6 text-sm text-muted">
            Running the simulation…
          </p>
        )}
        {!pending && mode === 'accumulation' && accumulation.data && accumulation.variables && (
          <AccumulationResults
            data={accumulation.data}
            request={accumulation.variables}
            basis={basis}
            onBasisChange={setBasis}
          />
        )}
        {!pending && mode === 'goal' && goal.data && goal.variables && (
          <GoalResults data={goal.data} frequency={goal.variables.frequency} />
        )}
        {!pending && mode === 'withdrawal' && withdrawal.data && withdrawal.variables && (
          <WithdrawalResults
            data={withdrawal.data}
            request={withdrawal.variables}
            basis={basis}
            onBasisChange={setBasis}
          />
        )}
      </div>
    </div>
  )
}
