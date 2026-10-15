import { useRef, type RefObject } from 'react'
import { ApiError } from '../api/client.ts'
import type { InvestmentRead } from '../api/types.ts'
import { useDeleteInvestment } from '../hooks/useInvestments.ts'
import { formatCurrency } from '../lib/format.ts'
import { investmentErrorMessage } from '../lib/investmentErrors.ts'
import { investmentTypeLabel } from '../lib/investmentTypes.ts'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'
import { FormError } from './FormError.tsx'

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

type InvestmentDeleteDialogProps = {
  investment: InvestmentRead
  /** Escape or Cancel: the caller unmounts the dialog. */
  onClose: () => void
  /** 204, after the list refetch. */
  onDeleted: () => void
  /** 404 (the investment was already gone), after the list refetch; receives the readable message. */
  onNotFound: (message: string) => void
  /** Focused on close when the row's Delete button is gone (see `Dialog`). */
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Confirmation before deleting an investment (`alertdialog`). Cancel has the initial focus so
 * Enter does not delete by accident. Errors other than a 404 keep the dialog open to retry.
 */
export function InvestmentDeleteDialog({
  investment,
  onClose,
  onDeleted,
  onNotFound,
  fallbackFocusRef,
}: InvestmentDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const mutation = useDeleteInvestment()
  // `isPending` only updates after a render: the ref also blocks a second click in the same tick.
  const sending = useRef(false)

  const confirm = () => {
    if (sending.current || mutation.isPending) {
      return
    }
    sending.current = true
    mutation.mutate(investment.id, {
      onSettled: () => {
        sending.current = false
      },
      onSuccess: onDeleted,
      onError: (error) => {
        if (isNotFound(error)) {
          onNotFound(investmentErrorMessage(error))
        }
      },
    })
  }

  const error = mutation.error && !isNotFound(mutation.error) ? mutation.error : null

  return (
    <Dialog
      title="Delete investment?"
      role="alertdialog"
      onClose={onClose}
      initialFocusRef={cancelRef}
      fallbackFocusRef={fallbackFocusRef}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm break-words text-foreground">
          {investment.name} · {investmentTypeLabel(investment.type)} ·{' '}
          <span className="whitespace-nowrap tabular-nums">
            {formatCurrency(investment.current_value)}
          </span>
        </p>
        <FormError message={error ? investmentErrorMessage(error) : undefined} />
        <div className="flex flex-wrap gap-3">
          <Button variant="danger" onClick={confirm} disabled={mutation.isPending}>
            Delete
          </Button>
          <Button ref={cancelRef} variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
