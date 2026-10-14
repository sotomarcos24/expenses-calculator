import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryTreeNode, TransactionPage, TransactionRead } from '../api/types.ts'
import { TRANSACTIONS_QUERY_KEY } from '../hooks/useTransactions.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

type Handler = NonNullable<Parameters<typeof mockMe>[1]>
type FetchMock = ReturnType<typeof mockMe>

const CATEGORIES: CategoryTreeNode[] = [
  {
    id: 1,
    name: 'Food',
    kind: 'expense',
    parent_id: null,
    subcategories: [
      { id: 2, name: 'Groceries', kind: 'expense', parent_id: 1 },
      { id: 3, name: 'Restaurants', kind: 'expense', parent_id: 1 },
    ],
  },
  { id: 4, name: 'Other', kind: 'expense', parent_id: null, subcategories: [] },
  { id: 5, name: 'Salary', kind: 'income', parent_id: null, subcategories: [] },
  { id: 6, name: 'Dividends', kind: 'income', parent_id: null, subcategories: [] },
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

const ROWS: TransactionRead[] = [
  transaction({
    id: 3,
    type: 'income',
    amount: '2400.00',
    gross_amount: '3000.00',
    deduction_rate: '0.2000',
    category_id: 5,
    category_name: 'Salary',
  }),
  transaction({ id: 2, amount: '5.00' }),
  transaction({
    id: 1,
    date: '2026-10-01',
    amount: '12.30',
    subcategory_id: 2,
    subcategory_name: 'Groceries',
    note: 'weekly shop',
  }),
]

function page(items: TransactionRead[], total = items.length): TransactionPage {
  return { items, total }
}

type ListHandler = (params: URLSearchParams) => TransactionPage | Response | Promise<Response>

/** Answers `/api/categories` and `/api/transactions` (the latter through `list`). */
function handler(list: ListHandler, categories: CategoryTreeNode[] = CATEGORIES): Handler {
  return (path) => {
    const url = new URL(path, 'http://localhost')
    if (url.pathname === '/api/categories') {
      return jsonResponse(categories)
    }
    if (url.pathname === '/api/transactions') {
      const result = list(url.searchParams)
      return result instanceof Response || result instanceof Promise ? result : jsonResponse(result)
    }
    throw new Error(`Unexpected request: ${path}`)
  }
}

function listCalls(fetchMock: FetchMock) {
  return fetchMock.mock.calls
    .map(([path]) => new URL(String(path), 'http://localhost'))
    .filter((url) => url.pathname === '/api/transactions')
    .map((url) => Object.fromEntries(url.searchParams))
}

function lastListCall(fetchMock: FetchMock) {
  return listCalls(fetchMock).at(-1)
}

async function renderTransactions(list: ListHandler = () => page(ROWS)) {
  const fetchMock = mockMe(200, handler(list))
  renderApp('/transactions')
  await screen.findByRole('heading', { name: 'Transactions' })
  return fetchMock
}

/** Waits until the category options are loaded into the Category select. */
async function waitForCategories() {
  await screen.findByRole('option', { name: 'Food' })
}

function select(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function rows() {
  const table = screen.getByRole('table', { name: 'Transactions' })
  return within(table).getAllByRole('row').slice(1)
}

function many(count: number, firstId = 1) {
  return Array.from({ length: count }, (_, index) => transaction({ id: firstId + index }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TransactionsPage', () => {
  it('requests this month by default, with page 1 and page_size 50', async () => {
    const fetchMock = await renderTransactions()
    await screen.findByRole('table', { name: 'Transactions' })
    expect(listCalls(fetchMock)).toEqual([
      { from: '2026-10-01', to: '2026-10-31', page: '1', page_size: '50' },
    ])
    expect(screen.getByLabelText('Period')).toHaveValue('this-month')
    expect(screen.getByLabelText('Type')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Subcategory')).toBeDisabled()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
  })

  it('renders rows in API order with their contents', async () => {
    await renderTransactions()
    await screen.findByRole('table', { name: 'Transactions' })
    expect(screen.getByText('3 transactions')).toBeInTheDocument()
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual([
      'Date',
      'Type',
      'Category',
      'Note',
      'Amount',
      'Actions',
    ])

    const [salary, food, groceries] = rows()
    const cells = (row: HTMLElement) => within(row).getAllByRole('cell')

    expect(cells(salary).map((cell) => cell.textContent)).toEqual([
      'Oct 14, 2026',
      'Income',
      'Salary',
      '',
      '+$2,400.00Gross $3,000.00 · 20.0% deductions',
      'EditDelete',
    ])
    const income = within(salary).getByText('+$2,400.00')
    expect(income).toHaveClass('text-gain')
    expect(within(salary).getByText('Gross $3,000.00 · 20.0% deductions')).toHaveClass('text-muted')

    expect(cells(food).map((cell) => cell.textContent)).toEqual([
      'Oct 14, 2026',
      'Expense',
      'Food',
      '',
      '−$5.00',
      'EditDelete',
    ])

    expect(cells(groceries).map((cell) => cell.textContent)).toEqual([
      'Oct 1, 2026',
      'Expense',
      'Food › Groceries',
      'weekly shop',
      '−$12.30',
      'EditDelete',
    ])
    const expense = within(groceries).getByText('−$12.30')
    expect(expense).toHaveClass('text-foreground')
    expect(expense).not.toHaveClass('text-loss')
    expect(within(groceries).queryByText(/Gross/)).not.toBeInTheDocument()
  })

  it('shows "1 transaction" for a single result', async () => {
    await renderTransactions(() => page([ROWS[1]]))
    expect(await screen.findByText('1 transaction')).toBeInTheDocument()
  })

  it('maps each period preset to from / to', async () => {
    const fetchMock = await renderTransactions()
    await screen.findByRole('table')

    select('Period', 'this-year')
    await waitFor(() =>
      expect(lastListCall(fetchMock)).toEqual({
        from: '2026-01-01',
        to: '2026-12-31',
        page: '1',
        page_size: '50',
      }),
    )

    select('Period', 'all-time')
    await waitFor(() => expect(lastListCall(fetchMock)).toEqual({ page: '1', page_size: '50' }))
  })

  it('filters by type, category and subcategory', async () => {
    const fetchMock = await renderTransactions()
    await waitForCategories()

    select('Type', 'expense')
    await waitFor(() => expect(lastListCall(fetchMock)).toMatchObject({ type: 'expense' }))

    select('Category', '1')
    await waitFor(() =>
      expect(lastListCall(fetchMock)).toEqual({
        from: '2026-10-01',
        to: '2026-10-31',
        type: 'expense',
        category_id: '1',
        page: '1',
        page_size: '50',
      }),
    )

    const subcategory = screen.getByLabelText('Subcategory')
    expect(subcategory).toBeEnabled()
    expect(
      within(subcategory)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All subcategories', 'Groceries', 'Restaurants'])
    select('Subcategory', '2')
    await waitFor(() =>
      expect(lastListCall(fetchMock)).toMatchObject({ category_id: '1', subcategory_id: '2' }),
    )

    // Changing the category resets the subcategory.
    select('Category', '4')
    expect(screen.getByLabelText('Subcategory')).toHaveValue('')
    expect(screen.getByLabelText('Subcategory')).toBeDisabled()
    await waitFor(() => expect(lastListCall(fetchMock)).toMatchObject({ category_id: '4' }))
    expect(lastListCall(fetchMock)).not.toHaveProperty('subcategory_id')
  })

  it('combines period, type and category in one request', async () => {
    const fetchMock = await renderTransactions()
    await waitForCategories()

    select('Period', 'this-year')
    select('Type', 'income')
    select('Category', '5')
    await waitFor(() =>
      expect(lastListCall(fetchMock)).toEqual({
        from: '2026-01-01',
        to: '2026-12-31',
        type: 'income',
        category_id: '5',
        page: '1',
        page_size: '50',
      }),
    )
    expect(screen.getByLabelText('Subcategory')).toBeDisabled()
  })

  it('groups categories by kind and lists only the selected kind', async () => {
    await renderTransactions()
    await waitForCategories()
    const category = screen.getByLabelText('Category')
    const groups = within(category).getAllByRole('group')
    expect(groups.map((group) => group.getAttribute('label'))).toEqual(['Expenses', 'Income'])
    expect(
      within(groups[0])
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Food', 'Other'])
    expect(
      within(groups[1])
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Salary', 'Dividends'])

    select('Type', 'income')
    expect(within(category).queryAllByRole('group')).toHaveLength(0)
    expect(
      within(category)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All categories', 'Salary', 'Dividends'])
  })

  it('resets an incompatible category when the type changes', async () => {
    const fetchMock = await renderTransactions()
    await waitForCategories()
    select('Category', '1')
    select('Subcategory', '2')

    select('Type', 'expense')
    expect(screen.getByLabelText('Category')).toHaveValue('1')
    expect(screen.getByLabelText('Subcategory')).toHaveValue('2')

    select('Type', 'income')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Subcategory')).toHaveValue('')
    await waitFor(() => expect(lastListCall(fetchMock)).toMatchObject({ type: 'income' }))
    expect(lastListCall(fetchMock)).not.toHaveProperty('category_id')
    expect(lastListCall(fetchMock)).not.toHaveProperty('subcategory_id')
  })

  it('offers only "All categories" while categories fail to load', async () => {
    const base = handler(() => page(ROWS))
    mockMe(200, (path, init) =>
      path === '/api/categories' ? new Response('oops', { status: 500 }) : base(path, init),
    )
    renderApp('/transactions')
    await screen.findByRole('table')
    expect(
      within(screen.getByLabelText('Category'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['All categories'])
  })

  it('clears the filters to All time and shows the button whenever a filter is active', async () => {
    const fetchMock = await renderTransactions()
    await waitForCategories()
    // The default This month counts as a filter.
    const clear = screen.getByRole('button', { name: 'Clear filters' })

    select('Type', 'expense')
    select('Category', '1')
    fireEvent.click(clear)

    expect(screen.getByLabelText('Period')).toHaveValue('all-time')
    expect(screen.getByLabelText('Type')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Subcategory')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    await waitFor(() => expect(lastListCall(fetchMock)).toEqual({ page: '1', page_size: '50' }))

    select('Period', 'this-year')
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  describe('custom range', () => {
    it('pre-fills From / To with the previous preset and sends them', async () => {
      const fetchMock = await renderTransactions()
      await screen.findByRole('table')

      select('Period', 'custom')
      expect(screen.getByLabelText('From')).toHaveValue('2026-10-01')
      expect(screen.getByLabelText('To')).toHaveValue('2026-10-31')

      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-05' } })
      await waitFor(() =>
        expect(lastListCall(fetchMock)).toEqual({
          from: '2026-10-05',
          to: '2026-10-31',
          page: '1',
          page_size: '50',
        }),
      )

      // An empty bound is open-ended.
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '' } })
      await waitFor(() =>
        expect(lastListCall(fetchMock)).toEqual({ from: '2026-10-05', page: '1', page_size: '50' }),
      )
    })

    it('pre-fills empty bounds after All time', async () => {
      await renderTransactions()
      select('Period', 'all-time')
      select('Period', 'custom')
      expect(screen.getByLabelText('From')).toHaveValue('')
      expect(screen.getByLabelText('To')).toHaveValue('')
    })

    it('shows an error and sends no request when From is after To', async () => {
      const fetchMock = await renderTransactions()
      await screen.findByRole('table')
      select('Period', 'custom')
      await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(1))

      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } })
      expect(screen.getByRole('alert')).toHaveTextContent('From must be on or before To')
      expect(screen.getByLabelText('From')).toHaveAttribute('aria-invalid', 'true')
      // Give any request a chance to be sent.
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(listCalls(fetchMock)).toHaveLength(1)
      expect(screen.queryByRole('table')).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-31' } })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      await waitFor(() =>
        expect(lastListCall(fetchMock)).toMatchObject({ from: '2026-10-31', to: '2026-10-31' }),
      )
    })
  })

  describe('pagination', () => {
    function paged(total: number) {
      return (params: URLSearchParams) => {
        const current = Number(params.get('page'))
        const start = (current - 1) * 50
        const count = Math.max(0, Math.min(50, total - start))
        return page(many(count, start + 1), total)
      }
    }

    function pagination() {
      return screen.getByRole('navigation', { name: 'Pagination' })
    }

    it('pages through 55 transactions', async () => {
      const fetchMock = await renderTransactions(paged(55))
      await screen.findByRole('table')
      expect(screen.getByText('55 transactions')).toBeInTheDocument()
      expect(rows()).toHaveLength(50)

      const nav = screen.getByRole('navigation', { name: 'Pagination' })
      expect(nav).toHaveTextContent('Page 1 of 2')
      const previous = within(nav).getByRole('button', { name: 'Previous' })
      const next = within(nav).getByRole('button', { name: 'Next' })
      expect(previous).toBeDisabled()
      expect(next).toBeEnabled()

      fireEvent.click(next)
      // Both are disabled while the page loads.
      expect(previous).toBeDisabled()
      expect(next).toBeDisabled()
      await waitFor(() => expect(nav).toHaveTextContent('Page 2 of 2'))
      await waitFor(() => expect(rows()).toHaveLength(5))
      expect(lastListCall(fetchMock)).toMatchObject({ page: '2', page_size: '50' })
      expect(next).toBeDisabled()
      await waitFor(() => expect(previous).toBeEnabled())

      fireEvent.click(previous)
      await waitFor(() => expect(rows()).toHaveLength(50))
      expect(nav).toHaveTextContent('Page 1 of 2')
    })

    it('returns to page 1 when a filter changes', async () => {
      const fetchMock = await renderTransactions(paged(55))
      await screen.findByRole('table')
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() => expect(lastListCall(fetchMock)).toMatchObject({ page: '2' }))
      await waitFor(() => expect(rows()).toHaveLength(5))

      select('Period', 'all-time')
      await waitFor(() => expect(lastListCall(fetchMock)).toEqual({ page: '1', page_size: '50' }))
      await waitFor(() =>
        expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent(
          'Page 1 of 2',
        ),
      )
    })

    it('hides the controls with 50 results or fewer', async () => {
      await renderTransactions(paged(50))
      await screen.findByRole('table')
      expect(rows()).toHaveLength(50)
      expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    })

    it('moves to the last page when the current one is past the end', async () => {
      let total = 101
      const fetchMock = mockMe(
        200,
        handler((params) => paged(total)(params)),
      )
      const { queryClient } = renderApp('/transactions')
      await screen.findByRole('table')
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() => expect(pagination()).toHaveTextContent('Page 2 of 3'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await waitFor(() => expect(rows()).toHaveLength(1))
      expect(pagination()).toHaveTextContent('Page 3 of 3')

      // The only row of page 3 is deleted elsewhere: page 3 now comes back empty.
      total = 100
      await act(() => queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY }))
      await waitFor(() => expect(pagination()).toHaveTextContent('Page 2 of 2'))
      await waitFor(() => expect(rows()).toHaveLength(50))
      const pagesRequested = listCalls(fetchMock).map((call) => call.page)
      expect(pagesRequested.slice(-2)).toEqual(['3', '2'])
    })
  })

  describe('states', () => {
    it('shows the loading text on the first load', async () => {
      await renderTransactions(() => new Promise<Response>(() => {}))
      expect(await screen.findByText('Loading transactions…')).toBeInTheDocument()
    })

    it('shows an error with Try again that refetches, keeping the filters usable', async () => {
      let fail = true
      const fetchMock = await renderTransactions(() =>
        fail ? new Response('Internal Server Error', { status: 500 }) : page(ROWS),
      )
      expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
        "Couldn't load transactions.",
      )
      expect(screen.getByLabelText('Period')).toBeEnabled()
      const callsBefore = listCalls(fetchMock).length

      fail = false
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await screen.findByRole('table')
      expect(listCalls(fetchMock).length).toBe(callsBefore + 1)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows "No transactions yet." when the user has none', async () => {
      const fetchMock = await renderTransactions(() => page([], 0))
      expect(await screen.findByText('No transactions yet.')).toBeInTheDocument()
      // This month is a filter, so the unfiltered total was checked.
      expect(listCalls(fetchMock)).toContainEqual({ page_size: '1' })
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByText(/placeholder|milestone/i)).not.toBeInTheDocument()
    })

    it('does not check the unfiltered total when no filter is active', async () => {
      const fetchMock = await renderTransactions(() => page([], 0))
      await screen.findByText('No transactions yet.')
      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
      await waitFor(() => expect(lastListCall(fetchMock)).toEqual({ page: '1', page_size: '50' }))
      expect(await screen.findByText('No transactions yet.')).toBeInTheDocument()
      expect(listCalls(fetchMock).filter((call) => call.page_size === '1')).toHaveLength(1)
    })

    it('does not check the unfiltered total when the list is not empty', async () => {
      const fetchMock = await renderTransactions()
      await screen.findByRole('table')
      expect(listCalls(fetchMock).filter((call) => call.page_size === '1')).toHaveLength(0)
    })

    it('shows "No transactions match these filters." with a Clear filters button', async () => {
      const fetchMock = await renderTransactions((params) =>
        params.get('page_size') === '1'
          ? page([ROWS[0]], 3)
          : params.has('from')
            ? page([], 0)
            : page(ROWS),
      )
      expect(await screen.findByText('No transactions match these filters.')).toBeInTheDocument()
      const clearButtons = screen.getAllByRole('button', { name: 'Clear filters' })
      fireEvent.click(clearButtons.at(-1)!)
      await screen.findByRole('table')
      expect(rows()).toHaveLength(3)
      expect(screen.getByLabelText('Period')).toHaveValue('all-time')
      expect(lastListCall(fetchMock)).toEqual({ page: '1', page_size: '50' })
    })
  })
})
