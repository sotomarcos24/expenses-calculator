import type { TransactionRead } from '../api/types.ts'
import { formatCurrency, formatDate, formatPercent, formatSignedAmount } from '../lib/format.ts'
import { Button } from './Button.tsx'

const HEADER_CLASS = 'px-3 py-2 text-left font-medium text-muted'
const CELL_CLASS = 'px-3 py-2 align-top'

function categoryLabel(transaction: TransactionRead) {
  return transaction.subcategory_name === null
    ? transaction.category_name
    : `${transaction.category_name} › ${transaction.subcategory_name}`
}

type TransactionTableProps = {
  transactions: TransactionRead[]
  /** Opens the edit dialog of a row. */
  onEdit: (transaction: TransactionRead) => void
}

/** Transactions table, in the order returned by the API (never re-sorted), with row actions. */
export function TransactionTable({ transactions, onEdit }: TransactionTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table aria-label="Transactions" className="min-w-full text-sm">
        <thead className="border-b border-border bg-surface">
          <tr>
            <th scope="col" className={HEADER_CLASS}>
              Date
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Type
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Category
            </th>
            <th scope="col" className={HEADER_CLASS}>
              Note
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Amount
            </th>
            <th scope="col" className={`${HEADER_CLASS} text-right`}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="border-b border-border last:border-b-0">
              <td className={`${CELL_CLASS} whitespace-nowrap text-foreground`}>
                {formatDate(transaction.date)}
              </td>
              <td className={`${CELL_CLASS} text-foreground`}>
                {transaction.type === 'income' ? 'Income' : 'Expense'}
              </td>
              <td className={`${CELL_CLASS} whitespace-nowrap text-foreground`}>
                {categoryLabel(transaction)}
              </td>
              <td className={`${CELL_CLASS} min-w-40 break-words text-foreground`}>
                {transaction.note}
              </td>
              <td className={`${CELL_CLASS} text-right whitespace-nowrap tabular-nums`}>
                <span
                  className={`font-medium ${transaction.type === 'income' ? 'text-gain' : 'text-foreground'}`}
                >
                  {formatSignedAmount(transaction.type, transaction.amount)}
                </span>
                {transaction.type === 'income' && transaction.gross_amount !== null && (
                  <span className="block text-xs text-muted">
                    Gross {formatCurrency(transaction.gross_amount)} ·{' '}
                    {formatPercent(transaction.deduction_rate)} deductions
                  </span>
                )}
              </td>
              <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Edit ${categoryLabel(transaction)}, ${formatDate(transaction.date)}, ${formatSignedAmount(transaction.type, transaction.amount)}`}
                  onClick={() => onEdit(transaction)}
                >
                  Edit
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
