import { useRef, type RefObject } from 'react'
import { ApiError } from '../api/client.ts'
import type { TransactionRead } from '../api/types.ts'
import { useDeleteTransaction } from '../hooks/useTransactions.ts'
import { formatCategoryLabel, formatDate, formatSignedAmount } from '../lib/format.ts'
import { transactionErrorMessage } from '../lib/transactionErrors.ts'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'
import { FormError } from './FormError.tsx'

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

type TransactionDeleteDialogProps = {
  transaction: TransactionRead
  /** Escape or Cancel: the caller unmounts the dialog. */
  onClose: () => void
  /** 204, after the list refetch. */
  onDeleted: () => void
  /** 404 (the row was already gone), after the list refetch; receives the readable message. */
  onNotFound: (message: string) => void
  /** Focused on close when the row's Delete button is gone (see `Dialog`). */
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Confirmation before deleting a transaction (`alertdialog`). Cancel has the initial focus so
 * Enter does not delete by accident. Errors other than a 404 keep the dialog open to retry.
 */
export function TransactionDeleteDialog({
  transaction,
  onClose,
  onDeleted,
  onNotFound,
  fallbackFocusRef,
}: TransactionDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const mutation = useDeleteTransaction()

  const confirm = () => {
    if (mutation.isPending) {
      return
    }
    mutation.mutate(transaction.id, {
      onSuccess: onDeleted,
      onError: (error) => {
        if (isNotFound(error)) {
          onNotFound(transactionErrorMessage(error))
        }
      },
    })
  }

  const error = mutation.error && !isNotFound(mutation.error) ? mutation.error : null

  return (
    <Dialog
      title="Delete transaction?"
      role="alertdialog"
      onClose={onClose}
      initialFocusRef={cancelRef}
      fallbackFocusRef={fallbackFocusRef}
    >
      <div className="flex flex-col gap-4">
        <div className="text-sm text-foreground">
          <p>
            {formatCategoryLabel(transaction)} · {formatDate(transaction.date)} ·{' '}
            <span className="whitespace-nowrap tabular-nums">
              {formatSignedAmount(transaction.type, transaction.amount)}
            </span>
          </p>
          {transaction.note && (
            <p className="mt-1 break-words whitespace-pre-wrap text-muted">{transaction.note}</p>
          )}
        </div>
        <FormError message={error ? transactionErrorMessage(error) : undefined} />
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
