import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryTreeNode, TransactionRead } from '../api/types.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

type FetchMock = ReturnType<typeof mockMe>

const CATEGORIES: CategoryTreeNode[] = [
  {
    id: 1,
    name: 'Food',
    kind: 'expense',
    parent_id: null,
    subcategories: [{ id: 2, name: 'Groceries', kind: 'expense', parent_id: 1 }],
  },
  { id: 5, name: 'Salary', kind: 'income', parent_id: null, subcategories: [] },
]

function transaction(overrides: Partial<TransactionRead> & { id: number }): TransactionRead {
  return {
    type: 'expense',
    date: '2026-10-14',
    amount: '10.00',
    gross_amount: null,
    deduction_rate: null,
    category_id: 1,
    category_name: 'Food',
    subcategory_id: null,
    subcategory_name: null,
    note: null,
    created_at: '2026-10-14T10:00:00Z',
    updated_at: '2026-10-14T10:00:00Z',
    ...overrides,
  }
}

const SALARY = transaction({
  id: 3,
  type: 'income',
  amount: '2400.00',
  gross_amount: '3000.00',
  deduction_rate: '0.2000',
  category_id: 5,
  category_name: 'Salary',
})

const GROCERIES = transaction({
  id: 1,
  date: '2026-10-01',
  amount: '12.30',
  subcategory_id: 2,
  subcategory_name: 'Groceries',
  note: 'weekly shop',
})

const GROCERIES_DELETE = 'Delete Food › Groceries, Oct 1, 2026, −$12.30'

type DeleteHandler = (id: number) => Response | Promise<Response>

/**
 * Fake API. The list pages `state.rows` (50 per page); a DELETE goes to `onDelete`, which by
 * default removes the row and answers 204; a POST answers 201.
 */
async function renderTransactions(
  rows: TransactionRead[] = [SALARY, GROCERIES],
  onDelete?: DeleteHandler,
) {
  const state = { rows }
  const fetchMock = mockMe(200, (path, init) => {
    const url = new URL(path, 'http://localhost')
    if (url.pathname === '/api/categories') {
      return jsonResponse(CATEGORIES)
    }
    if (url.pathname.startsWith('/api/transactions/') && init.method === 'DELETE') {
      const id = Number(url.pathname.split('/').at(-1))
      if (onDelete) {
        return onDelete(id)
      }
      state.rows = state.rows.filter((row) => row.id !== id)
      return new Response(null, { status: 204 })
    }
    if (url.pathname === '/api/transactions' && init.method === 'POST') {
      return jsonResponse(transaction({ id: 99 }), 201)
    }
    if (url.pathname === '/api/transactions') {
      const page = Number(url.searchParams.get('page') ?? 1)
      const size = Number(url.searchParams.get('page_size') ?? 50)
      const items = state.rows.slice((page - 1) * size, page * size)
      return jsonResponse({ items, total: state.rows.length })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  renderApp('/transactions')
  await screen.findByRole('table', { name: 'Transactions' })
  return { fetchMock, state }
}

function deleteCalls(fetchMock: FetchMock) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'DELETE')
    .map(([path, init]) => ({
      path: String(path),
      headers: init?.headers as Record<string, string>,
      body: init?.body,
    }))
}

function listCalls(fetchMock: FetchMock) {
  return fetchMock.mock.calls
    .map(([path, init]) => ({ url: new URL(String(path), 'http://localhost'), init }))
    .filter(({ url, init }) => url.pathname === '/api/transactions' && !init?.method)
    .map(({ url }) => Object.fromEntries(url.searchParams))
}

function addButton() {
  return screen.getAllByRole('button', { name: 'Add transaction' })[0]
}

function rows() {
  const table = screen.getByRole('table', { name: 'Transactions' })
  return within(table).getAllByRole('row').slice(1)
}

/** Focuses and clicks a row's Delete button, and returns it with the confirmation dialog. */
async function openDelete(name: string) {
  const trigger = screen.getByRole('button', { name })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete transaction?' })
  return { trigger, dialog }
}

function confirm(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
}

function many(count: number) {
  return Array.from({ length: count }, (_, index) => transaction({ id: index + 1 }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Delete transaction', () => {
  it('names each Delete button after its row', async () => {
    await renderTransactions()
    expect(
      screen.getByRole('button', { name: 'Delete Salary, Oct 14, 2026, +$2,400.00' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: GROCERIES_DELETE })).toBeVisible()
  })

  it('opens a labelled confirmation with the row summary and Cancel focused', async () => {
    await renderTransactions()
    const { dialog } = await openDelete(GROCERIES_DELETE)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Food › Groceries · Oct 1, 2026 · −$12.30')
    expect(dialog).toHaveTextContent('weekly shop')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()

    // Tab / Shift+Tab stay inside the dialog.
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const remove = within(dialog).getByRole('button', { name: 'Delete' })
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(remove).toHaveFocus()
    fireEvent.keyDown(remove, { key: 'Tab', shiftKey: true })
    expect(cancel).toHaveFocus()
  })

  it('closes on Cancel without a request and returns focus to the row', async () => {
    const { fetchMock } = await renderTransactions()
    const { trigger, dialog } = await openDelete(GROCERIES_DELETE)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(rows()).toHaveLength(2)
    expect(deleteCalls(fetchMock)).toEqual([])
  })

  it('closes on Escape without a request and returns focus to the row', async () => {
    const { fetchMock } = await renderTransactions()
    const { trigger, dialog } = await openDelete(GROCERIES_DELETE)
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Cancel' }), { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(rows()).toHaveLength(2)
    expect(deleteCalls(fetchMock)).toEqual([])
  })

  it('deletes on confirm, refetches and shows "Transaction deleted."', async () => {
    const { fetchMock } = await renderTransactions()
    expect(screen.getByText('2 transactions')).toBeInTheDocument()
    const { dialog } = await openDelete(GROCERIES_DELETE)
    confirm(dialog)

    expect(await screen.findByText('Transaction deleted.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: GROCERIES_DELETE })).not.toBeInTheDocument()
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('1 transaction')).toBeInTheDocument()
    expect(addButton()).toHaveFocus()

    const calls = deleteCalls(fetchMock)
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/api/transactions/1')
    expect(calls[0].headers['Content-Type']).toBe('application/json')
    expect(calls[0].body).toBeUndefined()
  })

  it('shows the previous page after deleting the only row of the last page', async () => {
    const { fetchMock } = await renderTransactions(many(51))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    const name = screen.getAllByRole('button', { name: /^Delete / })[0].getAttribute('aria-label')!
    const { dialog } = await openDelete(name)
    confirm(dialog)

    await screen.findByText('Transaction deleted.')
    await waitFor(() => expect(rows()).toHaveLength(50))
    expect(screen.getByText('50 transactions')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    expect(listCalls(fetchMock).at(-1)).toMatchObject({ page: '1' })
  })

  it('shows "No transactions yet." after deleting the last transaction', async () => {
    await renderTransactions([GROCERIES])
    const { dialog } = await openDelete(GROCERIES_DELETE)
    confirm(dialog)

    expect(await screen.findByText('No transactions yet.')).toBeInTheDocument()
    expect(screen.getByText('Transaction deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('closes on a 404, shows "Transaction not found" and refetches', async () => {
    const { fetchMock, state } = await renderTransactions(undefined, () => {
      state.rows = [SALARY]
      return jsonResponse({ detail: 'Transaction not found' }, 404)
    })
    const listCallsBefore = listCalls(fetchMock).length
    const { dialog } = await openDelete(GROCERIES_DELETE)
    confirm(dialog)

    expect(await screen.findByRole('alert')).toHaveTextContent('Transaction not found')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(listCalls(fetchMock).length).toBeGreaterThan(listCallsBefore)
    expect(screen.queryByRole('button', { name: GROCERIES_DELETE })).not.toBeInTheDocument()
    expect(screen.queryByText('Transaction deleted.')).not.toBeInTheDocument()
    expect(addButton()).toHaveFocus()
  })

  it('keeps the dialog open on a 500 and allows a retry', async () => {
    let fail = true
    const { fetchMock } = await renderTransactions(undefined, () =>
      fail ? new Response('oops', { status: 500 }) : new Response(null, { status: 204 }),
    )
    const { dialog } = await openDelete(GROCERIES_DELETE)
    confirm(dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
    expect(screen.getByRole('alertdialog', { name: 'Delete transaction?' })).toBe(dialog)
    expect(screen.getByRole('button', { name: GROCERIES_DELETE })).toBeInTheDocument()
    expect(rows()).toHaveLength(2)
    const remove = within(dialog).getByRole('button', { name: 'Delete' })
    expect(remove).toBeEnabled()

    fail = false
    fireEvent.click(remove)
    await screen.findByText('Transaction deleted.')
    expect(deleteCalls(fetchMock)).toHaveLength(2)
  })

  it('disables Delete while the request is pending', async () => {
    let resolve: (response: Response) => void = () => {}
    const { fetchMock } = await renderTransactions(
      undefined,
      () => new Promise<Response>((done) => (resolve = done)) as unknown as Response,
    )
    const { dialog } = await openDelete(GROCERIES_DELETE)
    const remove = within(dialog).getByRole('button', { name: 'Delete' })
    confirm(dialog)
    await waitFor(() => expect(remove).toBeDisabled())
    fireEvent.click(remove)
    expect(deleteCalls(fetchMock)).toHaveLength(1)

    await act(async () => resolve(new Response(null, { status: 204 })))
    await screen.findByText('Transaction deleted.')
  })
})

describe('page messages', () => {
  it('replaces "Transaction deleted." when another action starts or a filter changes', async () => {
    await renderTransactions()
    let { dialog } = await openDelete(GROCERIES_DELETE)
    confirm(dialog)
    await screen.findByText('Transaction deleted.')

    // Opening another action clears it.
    ;({ dialog } = await openDelete('Delete Salary, Oct 14, 2026, +$2,400.00'))
    expect(screen.queryByText('Transaction deleted.')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    ;({ dialog } = await openDelete('Delete Salary, Oct 14, 2026, +$2,400.00'))
    confirm(dialog)
    await screen.findByText('Transaction deleted.')

    // A filter change clears it too.
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'all-time' } })
    expect(screen.queryByText('Transaction deleted.')).not.toBeInTheDocument()
  })

  it('never shows "Transaction saved." together with a delete message', async () => {
    const { state } = await renderTransactions(undefined, () => {
      state.rows = [SALARY]
      return jsonResponse({ detail: 'Transaction not found' }, 404)
    })
    const { dialog } = await openDelete(GROCERIES_DELETE)
    confirm(dialog)
    await screen.findByRole('alert')

    fireEvent.click(addButton())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const form = await screen.findByRole('dialog', { name: 'Add transaction' })
    await within(form).findByRole('option', { name: 'Food' })
    fireEvent.change(within(form).getByLabelText('Amount'), { target: { value: '5' } })
    fireEvent.change(within(form).getByLabelText('Category'), { target: { value: '1' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))

    await screen.findByText('Transaction saved.')
    expect(screen.queryByText('Transaction not found')).not.toBeInTheDocument()
    expect(screen.queryByText('Transaction deleted.')).not.toBeInTheDocument()
  })
})
