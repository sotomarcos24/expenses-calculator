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
    subcategories: [
      { id: 2, name: 'Groceries', kind: 'expense', parent_id: 1 },
      { id: 3, name: 'Restaurants', kind: 'expense', parent_id: 1 },
    ],
  },
  { id: 4, name: 'Other', kind: 'expense', parent_id: null, subcategories: [] },
  { id: 5, name: 'Salary', kind: 'income', parent_id: null, subcategories: [] },
  {
    id: 6,
    name: 'Freelance',
    kind: 'income',
    parent_id: null,
    subcategories: [{ id: 7, name: 'Design', kind: 'income', parent_id: 6 }],
  },
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

type MutationHandler = (body: unknown, path: string) => Response | Promise<Response>

type Backend = {
  rows?: TransactionRead[]
  categories?: CategoryTreeNode[]
  /** When set, `GET /api/categories` answers only once this promise resolves. */
  categoriesReady?: Promise<void>
  /** Answers `POST /api/transactions` and `PATCH /api/transactions/{id}`. */
  mutate?: MutationHandler
}

/**
 * Fake API: the list returns `backend.rows` (mutable, so a test can change what the refetch sees),
 * the categories `backend.categories`, and mutations go to `backend.mutate` (201 by default).
 */
async function renderTransactions(backend: Backend = {}) {
  const state = { rows: backend.rows ?? [SALARY, GROCERIES] }
  const fetchMock = mockMe(200, (path, init) => {
    const url = new URL(path, 'http://localhost')
    if (url.pathname === '/api/categories') {
      const response = jsonResponse(backend.categories ?? CATEGORIES)
      return backend.categoriesReady ? backend.categoriesReady.then(() => response) : response
    }
    if (url.pathname.startsWith('/api/transactions') && init.method && init.method !== 'GET') {
      const body = JSON.parse(String(init.body))
      return backend.mutate
        ? backend.mutate(body, url.pathname)
        : jsonResponse(transaction({ id: 99, ...body }), 201)
    }
    if (url.pathname === '/api/transactions') {
      return jsonResponse({ items: state.rows, total: state.rows.length })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  renderApp('/transactions')
  await screen.findByRole('heading', { name: 'Transactions' })
  return { fetchMock, state }
}

function mutationCalls(fetchMock: FetchMock) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST' || init?.method === 'PATCH')
    .map(([path, init]) => ({
      method: init?.method,
      path: String(path),
      body: JSON.parse(String(init?.body)) as unknown,
    }))
}

function listCallCount(fetchMock: FetchMock) {
  return fetchMock.mock.calls.filter(
    ([path, init]) =>
      new URL(String(path), 'http://localhost').pathname === '/api/transactions' &&
      (init?.method ?? 'GET') === 'GET',
  ).length
}

function addButton() {
  return screen.getAllByRole('button', { name: 'Add transaction' })[0]
}

/** Opens the Add dialog once categories are loaded, and returns it. */
async function openAdd() {
  await screen.findByRole('table', { name: 'Transactions' })
  fireEvent.click(addButton())
  const dialog = await screen.findByRole('dialog', { name: 'Add transaction' })
  await within(dialog).findByRole('option', { name: 'Food' })
  return dialog
}

function type(dialog: HTMLElement, label: string, value: string) {
  fireEvent.change(within(dialog).getByLabelText(label), { target: { value } })
}

function pick(dialog: HTMLElement, label: string, optionName: string) {
  const select = within(dialog).getByLabelText(label)
  const option = within(select).getByRole('option', { name: optionName }) as HTMLOptionElement
  fireEvent.change(select, { target: { value: option.value } })
}

function chooseType(dialog: HTMLElement, name: 'Income' | 'Expense') {
  fireEvent.click(within(dialog).getByRole('radio', { name }))
}

function optionNames(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent)
}

function save(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 23, 30, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Add transaction', () => {
  it('creates an expense with the exact body, closes and refetches the list', async () => {
    const { fetchMock } = await renderTransactions()
    const dialog = await openAdd()

    expect(within(dialog).getByRole('radio', { name: 'Expense' })).toBeChecked()
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-14')
    expect(within(dialog).getByLabelText('Amount')).toHaveAttribute('inputmode', 'decimal')
    expect(within(dialog).getByLabelText('Amount')).not.toHaveAttribute('type', 'number')

    type(dialog, 'Amount', '12.30')
    pick(dialog, 'Category', 'Food')
    pick(dialog, 'Subcategory', 'Groceries')
    type(dialog, 'Note (optional)', '  weekly shop  ')
    const listCallsBefore = listCallCount(fetchMock)
    save(dialog)

    expect(await screen.findByText('Transaction saved.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutationCalls(fetchMock)).toEqual([
      {
        method: 'POST',
        path: '/api/transactions',
        body: {
          type: 'expense',
          date: '2026-10-14',
          amount: '12.30',
          gross_amount: null,
          category_id: 1,
          subcategory_id: 2,
          note: 'weekly shop',
        },
      },
    ])
    expect(listCallCount(fetchMock)).toBeGreaterThan(listCallsBefore)
  })

  it('creates an income with its gross amount and shows the live rate', async () => {
    const { fetchMock } = await renderTransactions()
    const dialog = await openAdd()

    chooseType(dialog, 'Income')
    type(dialog, 'Amount', '2400')
    type(dialog, 'Gross amount (optional)', '3000')
    expect(within(dialog).getByText('Deduction rate: 20.0%')).toBeInTheDocument()
    pick(dialog, 'Category', 'Salary')
    save(dialog)

    await screen.findByText('Transaction saved.')
    expect(mutationCalls(fetchMock)[0].body).toEqual({
      type: 'income',
      date: '2026-10-14',
      amount: '2400',
      gross_amount: '3000',
      category_id: 5,
      subcategory_id: null,
      note: null,
    })
  })

  it('accepts the largest amount, future dates and a whitespace-only note', async () => {
    const { fetchMock } = await renderTransactions()
    const dialog = await openAdd()

    type(dialog, 'Date', '2027-10-14')
    type(dialog, 'Amount', '9999999999.99')
    pick(dialog, 'Category', 'Other')
    type(dialog, 'Note (optional)', '   ')
    save(dialog)

    await screen.findByText('Transaction saved.')
    expect(mutationCalls(fetchMock)[0].body).toMatchObject({
      date: '2027-10-14',
      amount: '9999999999.99',
      note: null,
      subcategory_id: null,
    })
  })

  it('is offered in the empty state', async () => {
    await renderTransactions({ rows: [] })
    await screen.findByText('No transactions yet.')
    const buttons = screen.getAllByRole('button', { name: 'Add transaction' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1])
    expect(await screen.findByRole('dialog', { name: 'Add transaction' })).toBeInTheDocument()
  })
})

describe('dependent fields', () => {
  it('lists the subcategories of the selected category and resets them on change', async () => {
    const { fetchMock } = await renderTransactions()
    const dialog = await openAdd()
    const subcategory = within(dialog).getByLabelText('Subcategory')

    expect(subcategory).toBeDisabled()
    expect(optionNames(within(dialog).getByLabelText('Category'))).toEqual([
      'Select a category',
      'Food',
      'Other',
    ])

    pick(dialog, 'Category', 'Food')
    expect(subcategory).toBeEnabled()
    expect(optionNames(subcategory)).toEqual(['None', 'Groceries', 'Restaurants'])
    pick(dialog, 'Subcategory', 'Restaurants')

    pick(dialog, 'Category', 'Other')
    expect(subcategory).toHaveValue('')
    expect(subcategory).toBeDisabled()

    // Subcategory is optional, even for a category that has some.
    pick(dialog, 'Category', 'Food')
    expect(subcategory).toHaveValue('')
    type(dialog, 'Amount', '5')
    save(dialog)
    await screen.findByText('Transaction saved.')
    expect(mutationCalls(fetchMock)[0].body).toMatchObject({ category_id: 1, subcategory_id: null })
  })

  it('disables Subcategory for Salary', async () => {
    await renderTransactions()
    const dialog = await openAdd()
    chooseType(dialog, 'Income')
    pick(dialog, 'Category', 'Salary')
    expect(within(dialog).getByLabelText('Subcategory')).toBeDisabled()
    pick(dialog, 'Category', 'Freelance')
    expect(optionNames(within(dialog).getByLabelText('Subcategory'))).toEqual(['None', 'Design'])
  })

  it('switching type resets category / subcategory and clears the gross amount', async () => {
    await renderTransactions()
    const dialog = await openAdd()

    expect(within(dialog).queryByLabelText('Gross amount (optional)')).not.toBeInTheDocument()
    pick(dialog, 'Category', 'Food')
    pick(dialog, 'Subcategory', 'Groceries')

    chooseType(dialog, 'Income')
    expect(within(dialog).getByLabelText('Category')).toHaveValue('')
    expect(within(dialog).getByLabelText('Subcategory')).toHaveValue('')
    expect(optionNames(within(dialog).getByLabelText('Category'))).toEqual([
      'Select a category',
      'Salary',
      'Freelance',
    ])
    const gross = within(dialog).getByLabelText('Gross amount (optional)')
    expect(gross).toHaveAccessibleDescription(
      'Before taxes and deductions. Amount is what you received.',
    )
    type(dialog, 'Gross amount (optional)', '3000')
    pick(dialog, 'Category', 'Freelance')
    pick(dialog, 'Subcategory', 'Design')

    chooseType(dialog, 'Expense')
    expect(within(dialog).queryByLabelText('Gross amount (optional)')).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Category')).toHaveValue('')
    expect(within(dialog).getByLabelText('Subcategory')).toHaveValue('')

    chooseType(dialog, 'Income')
    expect(within(dialog).getByLabelText('Gross amount (optional)')).toHaveValue('')
  })

  it('updates the live deduction rate while typing', async () => {
    await renderTransactions()
    const dialog = await openAdd()
    chooseType(dialog, 'Income')
    const region = dialog.querySelector('[aria-live="polite"]')
    expect(region).toHaveTextContent('')

    type(dialog, 'Amount', '2400')
    type(dialog, 'Gross amount (optional)', '3000')
    expect(region).toHaveTextContent('Deduction rate: 20.0%')

    type(dialog, 'Amount', '5')
    type(dialog, 'Gross amount (optional)', '6')
    expect(region).toHaveTextContent('Deduction rate: 16.7%')

    type(dialog, 'Gross amount (optional)', '4')
    expect(region).toHaveTextContent('')

    type(dialog, 'Gross amount (optional)', '5')
    expect(region).toHaveTextContent('Deduction rate: 0.0%')

    type(dialog, 'Gross amount (optional)', '')
    expect(region).toHaveTextContent('')
  })

  it('links to the Categories page when there are no categories of the type', async () => {
    await renderTransactions({ categories: CATEGORIES.filter((c) => c.kind === 'expense') })
    const dialog = await openAdd()
    expect(within(dialog).queryByText(/No expense categories/)).not.toBeInTheDocument()

    chooseType(dialog, 'Income')
    const hint = within(dialog).getByText(/No income categories\./)
    expect(hint).toHaveTextContent('No income categories. Add one on the Categories page.')
    const link = within(hint).getByRole('link', { name: 'Add one on the Categories page.' })
    expect(link).toHaveAttribute('href', '/categories')

    fireEvent.click(link)
    expect(await screen.findByRole('heading', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('validation', () => {
  async function submitWith(
    values: Record<string, string>,
    txType: 'Expense' | 'Income' = 'Expense',
  ) {
    const { fetchMock } = await renderTransactions()
    const dialog = await openAdd()
    chooseType(dialog, txType)
    for (const [label, value] of Object.entries(values)) {
      if (label === 'Category') {
        pick(dialog, label, value)
      } else {
        type(dialog, label, value)
      }
    }
    save(dialog)
    return { fetchMock, dialog }
  }

  it.each([
    ['0', 'Amount must be greater than 0'],
    ['-5', 'Amount must be greater than 0'],
    ['10.123', 'Use at most 2 decimal places'],
    ['10000000000', 'Amount must be at most 9,999,999,999.99'],
    ['abc', 'Enter an amount like 1234.56'],
    ['', 'Amount is required'],
  ])('amount %j shows %j and sends nothing', async (amount, message) => {
    const { fetchMock, dialog } = await submitWith({ Amount: amount, Category: 'Food' })
    const error = await within(dialog).findByText(message)
    const input = within(dialog).getByLabelText('Amount')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', error.id)
    expect(input).toHaveFocus()
    expect(mutationCalls(fetchMock)).toEqual([])
  })

  it('requires a category', async () => {
    const { fetchMock, dialog } = await submitWith({ Amount: '5' })
    await within(dialog).findByText('Select a category', { selector: 'p' })
    const select = within(dialog).getByLabelText('Category')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveFocus()
    expect(mutationCalls(fetchMock)).toEqual([])
  })

  it('rejects a gross amount below the amount', async () => {
    const { fetchMock, dialog } = await submitWith(
      { Amount: '2400', 'Gross amount (optional)': '2000', Category: 'Salary' },
      'Income',
    )
    await within(dialog).findByText('Gross amount must be at least the amount')
    expect(within(dialog).getByLabelText('Gross amount (optional)')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(mutationCalls(fetchMock)).toEqual([])
  })

  it('rejects a note over 500 characters', async () => {
    const { fetchMock, dialog } = await submitWith({
      Amount: '5',
      Category: 'Food',
      'Note (optional)': 'a'.repeat(501),
    })
    await within(dialog).findByText('Note must be at most 500 characters')
    const note = within(dialog).getByLabelText('Note (optional)')
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(note).not.toHaveAttribute('maxlength')
    expect(mutationCalls(fetchMock)).toEqual([])
  })

  it('shows every error on submit and updates them while correcting', async () => {
    const { fetchMock, dialog } = await submitWith({ Amount: '' })
    await within(dialog).findByText('Amount is required')
    expect(within(dialog).getByText('Select a category', { selector: 'p' })).toBeInTheDocument()

    type(dialog, 'Amount', '12')
    await waitFor(() =>
      expect(within(dialog).queryByText('Amount is required')).not.toBeInTheDocument(),
    )
    expect(mutationCalls(fetchMock)).toEqual([])
  })
})

describe('Edit transaction', () => {
  it('names each Edit button after its row', async () => {
    await renderTransactions()
    await screen.findByRole('table', { name: 'Transactions' })
    expect(
      screen.getByRole('button', { name: 'Edit Food › Groceries, Oct 1, 2026, −$12.30' }),
    ).toHaveTextContent('Edit')
    expect(
      screen.getByRole('button', { name: 'Edit Salary, Oct 14, 2026, +$2,400.00' }),
    ).toBeInTheDocument()
  })

  it('pre-fills the form, sends a PATCH and shows the updated row', async () => {
    const { fetchMock, state } = await renderTransactions({
      mutate: (body) => {
        const updated = { ...GROCERIES, ...(body as object), amount: '15.00' }
        state.rows = [SALARY, updated]
        return jsonResponse(updated)
      },
    })
    await screen.findByRole('table', { name: 'Transactions' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Food › Groceries, Oct 1, 2026, −$12.30' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    expect(within(dialog).getByRole('radio', { name: 'Expense' })).toBeChecked()
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-01')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('12.30')
    expect(within(dialog).getByLabelText('Category')).toHaveValue('1')
    expect(within(dialog).getByLabelText('Subcategory')).toHaveValue('2')
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('weekly shop')

    type(dialog, 'Amount', '15.00')
    save(dialog)

    await screen.findByText('Transaction saved.')
    expect(mutationCalls(fetchMock)).toEqual([
      {
        method: 'PATCH',
        path: '/api/transactions/1',
        body: {
          type: 'expense',
          date: '2026-10-01',
          amount: '15.00',
          gross_amount: null,
          category_id: 1,
          subcategory_id: 2,
          note: 'weekly shop',
        },
      },
    ])
    expect(
      await screen.findByRole('button', { name: 'Edit Food › Groceries, Oct 1, 2026, −$15.00' }),
    ).toBeInTheDocument()
  })

  it('keeps the row category and subcategory when the categories load after opening', async () => {
    let release: () => void = () => {}
    const categoriesReady = new Promise<void>((done) => (release = done))
    await renderTransactions({ categoriesReady })
    await screen.findByRole('table', { name: 'Transactions' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Food › Groceries, Oct 1, 2026, −$12.30' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    expect(within(dialog).getByLabelText('Category')).toBeDisabled()

    await act(async () => release())
    await within(dialog).findByRole('option', { name: 'Groceries' })
    expect(within(dialog).getByLabelText('Category')).toHaveValue('1')
    expect(within(dialog).getByLabelText('Subcategory')).toHaveValue('2')
  })

  it('pre-fills a salary and clears its gross amount when it becomes an expense', async () => {
    const { fetchMock } = await renderTransactions({
      mutate: (body) => jsonResponse({ ...SALARY, ...(body as object) }),
    })
    await screen.findByRole('table', { name: 'Transactions' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Salary, Oct 14, 2026, +$2,400.00' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    expect(within(dialog).getByRole('radio', { name: 'Income' })).toBeChecked()
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('2400.00')
    expect(within(dialog).getByLabelText('Gross amount (optional)')).toHaveValue('3000.00')
    expect(within(dialog).getByText('Deduction rate: 20.0%')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Category')).toHaveValue('5')
    expect(within(dialog).getByLabelText('Subcategory')).toHaveValue('')
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('')

    chooseType(dialog, 'Expense')
    pick(dialog, 'Category', 'Other')
    save(dialog)

    await screen.findByText('Transaction saved.')
    expect(mutationCalls(fetchMock)[0]).toEqual({
      method: 'PATCH',
      path: '/api/transactions/3',
      body: {
        type: 'expense',
        date: '2026-10-14',
        amount: '2400.00',
        gross_amount: null,
        category_id: 4,
        subcategory_id: null,
        note: null,
      },
    })
  })
})

describe('Edit of a row deleted elsewhere', () => {
  it('shows "Transaction not found" and the row is gone after Cancel', async () => {
    const { fetchMock, state } = await renderTransactions({
      mutate: () => {
        state.rows = [SALARY]
        return jsonResponse({ detail: 'Transaction not found' }, 404)
      },
    })
    await screen.findByRole('table', { name: 'Transactions' })
    const listCallsBefore = listCallCount(fetchMock)
    const trigger = screen.getByRole('button', {
      name: 'Edit Food › Groceries, Oct 1, 2026, −$12.30',
    })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    type(dialog, 'Amount', '15.00')
    save(dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Transaction not found')
    expect(screen.getByRole('dialog', { name: 'Edit transaction' })).toBe(dialog)
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('15.00')
    expect(mutationCalls(fetchMock).map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'PATCH', path: '/api/transactions/1' },
    ])
    await waitFor(() => expect(listCallCount(fetchMock)).toBeGreaterThan(listCallsBefore))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^Edit Food › Groceries/ }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByText('Transaction saved.')).not.toBeInTheDocument()
    // The Edit button that opened the dialog is gone: focus falls back to "Add transaction".
    expect(addButton()).toHaveFocus()
  })
})

describe('API errors', () => {
  async function failWith(response: () => Response) {
    const { fetchMock } = await renderTransactions({ mutate: () => response() })
    const dialog = await openAdd()
    type(dialog, 'Amount', '12.30')
    pick(dialog, 'Category', 'Food')
    pick(dialog, 'Subcategory', 'Groceries')
    type(dialog, 'Note (optional)', 'weekly shop')
    save(dialog)
    return { fetchMock, dialog }
  }

  function expectValuesKept(dialog: HTMLElement) {
    expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBe(dialog)
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('12.30')
    expect(within(dialog).getByLabelText('Category')).toHaveValue('1')
    expect(within(dialog).getByLabelText('Subcategory')).toHaveValue('2')
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('weekly shop')
  }

  it('shows a 422 string detail verbatim and keeps the values', async () => {
    const detail = 'The subcategory must belong to the category'
    const { dialog } = await failWith(() => jsonResponse({ detail }, 422))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(detail)
    expectValuesKept(dialog)
  })

  it('shows a 404 "Category not found" and refetches the list', async () => {
    const { dialog, fetchMock } = await failWith(() =>
      jsonResponse({ detail: 'Category not found' }, 404),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Category not found')
    expectValuesKept(dialog)
    // The list was loaded once before saving; the 404 invalidates it.
    await waitFor(() => expect(listCallCount(fetchMock)).toBeGreaterThan(1))
  })

  it('shows the generic message for a 500', async () => {
    const { dialog } = await failWith(() => new Response('oops', { status: 500 }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
    expectValuesKept(dialog)
  })

  it('disables Save while the request is pending', async () => {
    let resolve: (response: Response) => void = () => {}
    const { fetchMock, dialog } = await failWith(
      () => new Promise<Response>((done) => (resolve = done)) as unknown as Response,
    )
    const saveButton = within(dialog).getByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveButton).toBeDisabled())
    fireEvent.click(saveButton)
    expect(mutationCalls(fetchMock)).toHaveLength(1)
    await act(async () => resolve(jsonResponse(transaction({ id: 99 }), 201)))
    await screen.findByText('Transaction saved.')
  })
})

describe('dialog accessibility', () => {
  it('is a labelled modal that moves focus inside and traps Tab', async () => {
    await renderTransactions()
    const dialog = await openAdd()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('radio', { name: 'Expense' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(within(dialog).getByRole('radio', { name: 'Expense' })).toHaveFocus()

    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(cancel).toHaveFocus()
  })

  it('keeps the dialog open on a backdrop click', async () => {
    await renderTransactions()
    const dialog = await openAdd()
    const backdrop = dialog.parentElement!
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(screen.getByRole('dialog', { name: 'Add transaction' })).toBeInTheDocument()
  })

  it('closes on Escape without a request and returns focus to the trigger', async () => {
    const { fetchMock } = await renderTransactions()
    await screen.findByRole('table', { name: 'Transactions' })
    const trigger = addButton()
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' })
    type(dialog, 'Amount', '5')
    fireEvent.keyDown(within(dialog).getByLabelText('Amount'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
    expect(mutationCalls(fetchMock)).toEqual([])
  })

  it('closes on Cancel and returns focus to the Edit button', async () => {
    const { fetchMock } = await renderTransactions()
    await screen.findByRole('table', { name: 'Transactions' })
    const trigger = screen.getByRole('button', { name: 'Edit Salary, Oct 14, 2026, +$2,400.00' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Edit transaction' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(mutationCalls(fetchMock)).toEqual([])
  })
})
