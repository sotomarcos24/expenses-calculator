import { zodResolver } from '@hookform/resolvers/zod'
import { useId, type ReactNode, type RefObject } from 'react'
import { useForm } from 'react-hook-form'
import type { InvestmentRead } from '../api/types.ts'
import { useCreateInvestment, useUpdateInvestment } from '../hooks/useInvestments.ts'
import { investmentErrorMessage } from '../lib/investmentErrors.ts'
import {
  emptyInvestmentForm,
  investmentFormSchema,
  investmentToForm,
  type InvestmentFormInput,
  type InvestmentPayload,
} from '../lib/investmentSchemas.ts'
import { INVESTMENT_TYPES, investmentTypeLabel } from '../lib/investmentTypes.ts'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'
import { FormError } from './FormError.tsx'
import { TextField } from './TextField.tsx'

function selectClass(error: string | undefined) {
  return `w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent ${
    error ? 'border-loss' : 'border-border focus:border-primary'
  }`
}

/** Label, control and inline error with the same ARIA wiring as `TextField`. */
function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode
}) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  )
}

type InvestmentFormDialogProps = {
  /** Row to edit (pre-fills the form, saves with `PATCH`); `null` adds a new investment. */
  investment: InvestmentRead | null
  /** Cancel / Escape: closes without saving. */
  onClose: () => void
  /** Called after a successful save, once the list has been refetched. */
  onSaved: () => void
  /** Focused on close when the button that opened the dialog is gone (see `Dialog`). */
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Create / edit dialog of an investment. Validates with the API rules before sending, sends every
 * field (money as decimal strings, `platform: null` when empty) and keeps the typed values when the
 * request fails.
 */
export function InvestmentFormDialog({
  investment,
  onClose,
  onSaved,
  fallbackFocusRef,
}: InvestmentFormDialogProps) {
  const create = useCreateInvestment()
  const update = useUpdateInvestment()
  const mutation = investment ? update : create

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvestmentFormInput, unknown, InvestmentPayload>({
    resolver: zodResolver(investmentFormSchema),
    defaultValues: investment ? investmentToForm(investment) : emptyInvestmentForm(),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })

  const onSubmit = (body: InvestmentPayload) => {
    if (mutation.isPending) {
      return
    }
    if (investment) {
      update.mutate({ id: investment.id, ...body }, { onSuccess: onSaved })
    } else {
      create.mutate(body, { onSuccess: onSaved })
    }
  }

  return (
    <Dialog
      title={investment ? 'Edit investment' : 'Add investment'}
      onClose={onClose}
      fallbackFocusRef={fallbackFocusRef}
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <TextField
          label="Name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />

        <Field label="Type" error={errors.type?.message}>
          {(aria) => (
            <select {...aria} className={selectClass(errors.type?.message)} {...register('type')}>
              <option value="">Select a type</option>
              {INVESTMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {investmentTypeLabel(type)}
                </option>
              ))}
            </select>
          )}
        </Field>

        <TextField
          label="Platform"
          autoComplete="off"
          hint="Optional. Where you hold it, e.g. your broker or bank."
          error={errors.platform?.message}
          {...register('platform')}
        />

        <TextField
          label="Amount invested"
          inputMode="decimal"
          autoComplete="off"
          error={errors.amount_invested?.message}
          {...register('amount_invested')}
        />

        <TextField
          label="Current value"
          inputMode="decimal"
          autoComplete="off"
          error={errors.current_value?.message}
          {...register('current_value')}
        />

        <TextField
          label="Last update"
          type="date"
          error={errors.value_updated_at?.message}
          {...register('value_updated_at')}
        />

        <FormError message={mutation.error ? investmentErrorMessage(mutation.error) : undefined} />

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            Save
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
