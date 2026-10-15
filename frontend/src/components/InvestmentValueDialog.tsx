import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { ApiError } from '../api/client.ts'
import type { InvestmentRead } from '../api/types.ts'
import { useUpdateInvestment } from '../hooks/useInvestments.ts'
import { formatCurrency, formatDate } from '../lib/format.ts'
import { investmentErrorMessage } from '../lib/investmentErrors.ts'
import { investmentMoneyErrorMessage } from '../lib/investmentSchemas.ts'
import { parseInvestmentMoney } from '../lib/money.ts'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'
import { FormError } from './FormError.tsx'
import { TextField } from './TextField.tsx'

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

/** Inline message for the typed value, or `undefined` when it is valid. */
function validate(value: string) {
  const parsed = parseInvestmentMoney(value)
  return parsed.ok ? undefined : investmentMoneyErrorMessage('Current value', parsed.error)
}

type InvestmentValueDialogProps = {
  investment: InvestmentRead
  /** Cancel / Escape: closes without saving. */
  onClose: () => void
  /** Called after a successful save, once the list has been refetched. */
  onSaved: () => void
  /** 404 (the row is gone), after the list refetch; receives the readable message. */
  onNotFound: (message: string) => void
  /** Focused on close when the button that opened the dialog is gone (see `Dialog`). */
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Quick "Update value" dialog: one field, sent alone as `{ current_value }` so the API moves the
 * last update to today (also when the value is unchanged, meaning "confirmed today"). Validated in
 * `bigint` cents before sending; API errors other than a 404 stay in the dialog.
 */
export function InvestmentValueDialog({
  investment,
  onClose,
  onSaved,
  onNotFound,
  fallbackFocusRef,
}: InvestmentValueDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(investment.current_value)
  // Validation runs on Save; after a failed Save it re-runs on every change.
  const [submitted, setSubmitted] = useState(false)
  const mutation = useUpdateInvestment()

  const error = submitted ? validate(value) : undefined

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    if (mutation.isPending || validate(value) !== undefined) {
      return
    }
    mutation.mutate(
      { id: investment.id, current_value: value.trim() },
      {
        onSuccess: onSaved,
        onError: (failure) => {
          if (isNotFound(failure)) {
            onNotFound(investmentErrorMessage(failure))
          }
        },
      },
    )
  }

  const apiError = mutation.error && !isNotFound(mutation.error) ? mutation.error : null

  return (
    <Dialog
      title="Update value"
      onClose={onClose}
      initialFocusRef={inputRef}
      fallbackFocusRef={fallbackFocusRef}
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="text-sm">
          <p className="font-medium break-words text-foreground">{investment.name}</p>
          <p className="mt-1 text-muted">
            Current value:{' '}
            <span className="whitespace-nowrap tabular-nums">
              {formatCurrency(investment.current_value)}
            </span>{' '}
            · Last update:{' '}
            <span className="whitespace-nowrap">{formatDate(investment.value_updated_at)}</span>
          </p>
        </div>

        <TextField
          ref={inputRef}
          label="New current value"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={error}
        />

        <FormError message={apiError ? investmentErrorMessage(apiError) : undefined} />

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
