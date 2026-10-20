import { useRef, useState, type FormEvent, type RefObject } from 'react'
import { usePutCategoryAmount } from '../hooks/useCategoryAmounts.ts'
import type { AmountTarget } from '../lib/categoryAmounts.ts'
import { categoryErrorMessage } from '../lib/categoryErrors.ts'
import { parseMoney } from '../lib/money.ts'
import { moneyErrorMessage, NOTE_MAX_LENGTH, NOTE_TOO_LONG } from '../lib/transactionSchemas.ts'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'
import { FormError } from './FormError.tsx'
import { TextField } from './TextField.tsx'

type Errors = { amount?: string; note?: string }

/** Validation with the API rules; `payload` is set only when both fields are valid. */
function validate(amount: string, note: string) {
  const errors: Errors = {}
  const parsed = parseMoney(amount)
  if (!parsed.ok) {
    errors.amount = moneyErrorMessage('Amount', parsed.error)
  }
  const trimmedNote = note.trim()
  // Length in code points, as the API counts it (Python `len`).
  if ([...trimmedNote].length > NOTE_MAX_LENGTH) {
    errors.note = NOTE_TOO_LONG
  }
  return { errors, trimmedNote }
}

type CategoryAmountDialogProps = {
  target: AmountTarget
  /** Cancel / Escape: closes without saving. */
  onClose: () => void
  /** Called after a successful save, once the data has been refetched. */
  onSaved: () => void
  /** Focused on close when the button that opened the dialog is gone (see `Dialog`). */
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Add / edit dialog of a fixed monthly amount. Only Amount and Note are editable; the category is
 * read-only context in the title. Saves with the same `PUT` for both; API errors stay in the
 * dialog with the typed values.
 */
export function CategoryAmountDialog({
  target,
  onClose,
  onSaved,
  fallbackFocusRef,
}: CategoryAmountDialogProps) {
  const amountRef = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState(target.amount?.amount ?? '')
  const [note, setNote] = useState(target.amount?.note ?? '')
  // Validation runs on Save; after a failed Save it re-runs on every change.
  const [submitted, setSubmitted] = useState(false)
  const mutation = usePutCategoryAmount()

  const { errors, trimmedNote } = validate(amount, note)
  const shown = submitted ? errors : {}

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    if (mutation.isPending || errors.amount || errors.note) {
      return
    }
    mutation.mutate(
      {
        category_id: target.categoryId,
        subcategory_id: target.subcategoryId,
        amount: amount.trim(),
        note: trimmedNote === '' ? null : trimmedNote,
      },
      { onSuccess: onSaved },
    )
  }

  return (
    <Dialog
      title={`Monthly amount for ${target.label}`}
      onClose={onClose}
      initialFocusRef={amountRef}
      fallbackFocusRef={fallbackFocusRef}
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Applies to every month. It is added to the{' '}
          {target.kind === 'income' ? 'income' : 'expenses'} of each period.
        </p>
        <TextField
          ref={amountRef}
          label="Amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={shown.amount}
        />
        <TextField
          label="Note (optional)"
          autoComplete="off"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          error={shown.note}
        />
        <FormError message={mutation.error ? categoryErrorMessage(mutation.error) : undefined} />
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
