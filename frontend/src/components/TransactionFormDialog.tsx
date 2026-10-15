import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, type ReactNode, type RefObject } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import type { CategoryKind, TransactionRead } from '../api/types.ts'
import { useCategories } from '../hooks/useCategories.ts'
import { useCreateTransaction, useUpdateTransaction } from '../hooks/useTransactions.ts'
import { formatPercent } from '../lib/format.ts'
import { deductionRate, parseMoney } from '../lib/money.ts'
import { transactionErrorMessage } from '../lib/transactionErrors.ts'
import {
  emptyTransactionForm,
  transactionFormSchema,
  transactionToForm,
  type TransactionFormInput,
  type TransactionPayload,
} from '../lib/transactionSchemas.ts'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'
import { FormError } from './FormError.tsx'
import { TextField } from './TextField.tsx'

const CONTROL_CLASS =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60'

function controlClass(error: string | undefined) {
  return `${CONTROL_CLASS} ${error ? 'border-loss' : 'border-border focus:border-primary'}`
}

const GROSS_HINT = 'Before taxes and deductions. Amount is what you received.'

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

const TYPE_OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
]

/** Live `Deduction rate: 20.0%`, or `null` unless both amounts are valid and gross ≥ amount. */
function deductionRateText(amount: string, gross: string) {
  const net = parseMoney(amount)
  const total = parseMoney(gross)
  if (!net.ok || !total.ok || total.cents < net.cents) {
    return null
  }
  return `Deduction rate: ${formatPercent(deductionRate(total.cents, net.cents))}`
}

type TransactionFormDialogProps = {
  /** Row to edit (pre-fills the form, saves with `PATCH`); `null` adds a new transaction. */
  transaction: TransactionRead | null
  /**
   * Values pre-filled in a new transaction (ignored when editing), over `emptyTransactionForm()`.
   */
  defaults?: Partial<TransactionFormInput>
  /** With `defaults`: type, category and subcategory cannot be changed (add from a category row). */
  lockCategory?: boolean
  /** Cancel / Escape: closes without saving. */
  onClose: () => void
  /** Called after a successful save, once the list has been refetched. */
  onSaved: () => void
  /** Focused on close when the button that opened the dialog is gone (see `Dialog`). */
  fallbackFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Create / edit dialog of a transaction. Validates with the API rules before sending, sends every
 * field (money as decimal strings) and keeps the typed values when the request fails.
 */
export function TransactionFormDialog({
  transaction,
  defaults,
  lockCategory = false,
  onClose,
  onSaved,
  fallbackFocusRef,
}: TransactionFormDialogProps) {
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const mutation = transaction ? update : create
  const categories = useCategories()

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<TransactionFormInput, unknown, TransactionPayload>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: transaction
      ? transactionToForm(transaction)
      : { ...emptyTransactionForm(), ...defaults },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const [type, categoryId, amount, grossAmount] = useWatch({
    control,
    name: ['type', 'category_id', 'amount', 'gross_amount'],
  })

  // A native <select> drops a value that has no <option> yet. If the categories arrive after the
  // dialog opened (edit pre-fill), write the row's category / subcategory back into the selects.
  const categoriesLoaded = categories.isSuccess
  useEffect(() => {
    if (categoriesLoaded) {
      setValue('category_id', getValues('category_id'))
      setValue('subcategory_id', getValues('subcategory_id'))
    }
  }, [categoriesLoaded, getValues, setValue])

  const options = type === 'income' ? categories.income : categories.expenses
  const selectedCategory = options.find((category) => String(category.id) === categoryId)
  const subcategories = selectedCategory?.subcategories ?? []
  const noCategories = categories.isSuccess && options.length === 0

  const locked = lockCategory && !transaction

  const onSubmit = (body: TransactionPayload) => {
    if (mutation.isPending) {
      return
    }
    if (transaction) {
      update.mutate({ id: transaction.id, ...body }, { onSuccess: onSaved })
    } else {
      create.mutate(body, { onSuccess: onSaved })
    }
  }

  const typeField = register('type', {
    onChange: (event: { target: { value: string } }) => {
      // A category of the other kind is never valid, and only an income has a gross amount.
      setValue('category_id', '')
      setValue('subcategory_id', '')
      if (event.target.value === 'expense') {
        setValue('gross_amount', '')
      }
    },
  })
  const categoryField = register('category_id', {
    onChange: () => setValue('subcategory_id', ''),
  })

  return (
    <Dialog
      title={transaction ? 'Edit transaction' : 'Add transaction'}
      onClose={onClose}
      fallbackFocusRef={fallbackFocusRef}
    >
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Type</legend>
          <div className="flex flex-wrap gap-4">
            {TYPE_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  value={option.value}
                  className="size-4 accent-primary"
                  disabled={locked}
                  {...typeField}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <TextField label="Date" type="date" error={errors.date?.message} {...register('date')} />

        <TextField
          label="Amount"
          inputMode="decimal"
          autoComplete="off"
          error={errors.amount?.message}
          {...register('amount')}
        />

        {type === 'income' && (
          <>
            <TextField
              label="Gross amount (optional)"
              inputMode="decimal"
              autoComplete="off"
              hint={GROSS_HINT}
              error={errors.gross_amount?.message}
              {...register('gross_amount')}
            />
            <p aria-live="polite" className="min-h-5 text-sm text-foreground">
              {deductionRateText(amount, grossAmount)}
            </p>
          </>
        )}

        <Field label="Category" error={errors.category_id?.message}>
          {(aria) => (
            <select
              {...aria}
              className={controlClass(errors.category_id?.message)}
              disabled={categories.isPending || locked}
              {...categoryField}
            >
              <option value="">Select a category</option>
              {options.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {noCategories && (
          <p className="-mt-2 text-sm text-muted">
            No {type} categories.{' '}
            <Link to="/categories" className="font-medium text-primary underline">
              Add one on the Categories page.
            </Link>
          </p>
        )}

        <Field label="Subcategory" error={errors.subcategory_id?.message}>
          {(aria) => (
            <select
              {...aria}
              className={controlClass(errors.subcategory_id?.message)}
              disabled={subcategories.length === 0 || locked}
              {...register('subcategory_id')}
            >
              <option value="">None</option>
              {subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Note (optional)" error={errors.note?.message}>
          {(aria) => (
            <textarea
              {...aria}
              rows={3}
              className={`${controlClass(errors.note?.message)} resize-y`}
              {...register('note')}
            />
          )}
        </Field>

        <FormError message={mutation.error ? transactionErrorMessage(mutation.error) : undefined} />

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
