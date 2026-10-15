import { useEffect, useRef, useState } from 'react'
import type { InvestmentRead } from '../api/types.ts'
import { Button } from '../components/Button.tsx'
import { FormError } from '../components/FormError.tsx'
import { InvestmentDeleteDialog } from '../components/InvestmentDeleteDialog.tsx'
import { InvestmentFormDialog } from '../components/InvestmentFormDialog.tsx'
import { InvestmentTable } from '../components/InvestmentTable.tsx'
import { InvestmentValueDialog } from '../components/InvestmentValueDialog.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { PortfolioTotalsCard } from '../components/PortfolioTotalsCard.tsx'
import { useInvestments } from '../hooks/useInvestments.ts'

function StatusText({ children }: { children: string }) {
  return (
    <p role="status" className="text-sm text-muted">
      {children}
    </p>
  )
}

type InvestmentsContentProps = {
  onAdd: () => void
  onEdit: (investment: InvestmentRead) => void
  onUpdateValue: (investment: InvestmentRead) => void
  onDelete: (investment: InvestmentRead) => void
}

function InvestmentsContent({ onAdd, onEdit, onUpdateValue, onDelete }: InvestmentsContentProps) {
  const { data, isPending, isError, isFetching, refetch } = useInvestments()

  if (isError) {
    return (
      <div className="flex max-w-sm flex-col gap-3">
        <FormError message="Couldn't load investments." />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="self-start"
        >
          Try again
        </Button>
      </div>
    )
  }
  if (isPending) {
    return <StatusText>Loading investments…</StatusText>
  }
  if (data.items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <StatusText>No investments yet.</StatusText>
        <Button size="sm" onClick={onAdd}>
          Add investment
        </Button>
      </div>
    )
  }
  return (
    <>
      <PortfolioTotalsCard totals={data.totals} />
      <InvestmentTable
        investments={data.items}
        onEdit={onEdit}
        onUpdateValue={onUpdateValue}
        onDelete={onDelete}
      />
    </>
  )
}

/**
 * Which dialog is open: none, a new investment, the edit of a row, its quick value update or its
 * delete confirmation.
 */
type DialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; investment: InvestmentRead }
  | { mode: 'value'; investment: InvestmentRead }
  | { mode: 'delete'; investment: InvestmentRead }

/**
 * Result of the last action, shown above the content: a polite status (`Investment saved.`) or an
 * alert for page-level errors. Opening any dialog clears it.
 */
type PageMessage = { kind: 'status' | 'alert'; text: string } | null

export function InvestmentsPage() {
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' })
  const [message, setMessage] = useState<PageMessage>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  // After a delete or a 404 the row and its buttons are gone: focus goes to "Add investment".
  const focusAddOnClose = useRef(false)

  useEffect(() => {
    if (dialog.mode === 'closed' && focusAddOnClose.current) {
      focusAddOnClose.current = false
      addButtonRef.current?.focus()
    }
  }, [dialog])

  const open = (next: DialogState) => {
    setMessage(null)
    setDialog(next)
  }
  const close = () => setDialog({ mode: 'closed' })
  // Closes the dialog with a page message and moves focus to "Add investment" (the row is gone).
  const closeWith = (next: PageMessage) => {
    focusAddOnClose.current = true
    close()
    setMessage(next)
  }
  const onAdd = () => open({ mode: 'create' })

  return (
    <>
      <PageHeader
        title="Investments"
        description="Track what you invested and what it is worth today."
        actions={
          <Button ref={addButtonRef} onClick={onAdd}>
            Add investment
          </Button>
        }
      />
      {/* Always rendered so screen readers announce the confirmation when it appears. */}
      <p
        role="status"
        className={message?.kind === 'status' ? 'mb-4 text-sm text-foreground' : 'sr-only'}
      >
        {message?.kind === 'status' ? message.text : ''}
      </p>
      {message?.kind === 'alert' && (
        <div className="mb-4">
          <FormError message={message.text} />
        </div>
      )}
      <InvestmentsContent
        onAdd={onAdd}
        onEdit={(investment) => open({ mode: 'edit', investment })}
        onUpdateValue={(investment) => open({ mode: 'value', investment })}
        onDelete={(investment) => open({ mode: 'delete', investment })}
      />
      {dialog.mode === 'delete' && (
        <InvestmentDeleteDialog
          investment={dialog.investment}
          onClose={close}
          onDeleted={() => closeWith({ kind: 'status', text: 'Investment deleted.' })}
          onNotFound={(text) => closeWith({ kind: 'alert', text })}
          fallbackFocusRef={addButtonRef}
        />
      )}
      {dialog.mode === 'value' && (
        <InvestmentValueDialog
          investment={dialog.investment}
          onClose={close}
          onSaved={() => {
            close()
            setMessage({ kind: 'status', text: 'Value updated.' })
          }}
          onNotFound={(text) => closeWith({ kind: 'alert', text })}
          fallbackFocusRef={addButtonRef}
        />
      )}
      {(dialog.mode === 'create' || dialog.mode === 'edit') && (
        <InvestmentFormDialog
          investment={dialog.mode === 'edit' ? dialog.investment : null}
          onClose={close}
          onSaved={() => {
            close()
            setMessage({ kind: 'status', text: 'Investment saved.' })
          }}
          fallbackFocusRef={addButtonRef}
        />
      )}
    </>
  )
}
