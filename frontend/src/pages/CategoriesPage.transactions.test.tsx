import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryTotals, CategoryTreeNode } from '../api/types.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

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
]

function totalsFor(groceries: string, other = '0.00', food = groceries): CategoryTotals[] {
  return [
    {
      category_id: 1,
      total: food,
      subcategories: [
        { id: 2, total: groceries },
        { id: 3, total: '0.00' },
      ],
    },
    { category_id: 4, total: other, subcategories: [] },
    { category_id: 5, total: '0.00', subcategories: [] },
  ]
}

type Post = { path: string; body: Record<string, unknown> }

function setup(options: { totals?: (path: string) => Response } = {}) {
  let groceries = '0.00'
  const posts: Post[] = []
  const totalsPaths: string[] = []
  const fetchMock = mockMe(200, (path, init) => {
    if (path === '/api/categories') {
      return jsonResponse(CATEGORIES)
    }
    if (path.startsWith('/api/categories/totals')) {
      totalsPaths.push(path)
      return options.totals ? options.totals(path) : jsonResponse(totalsFor(groceries))
    }
    if (path === '/api/transactions' && init.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      posts.push({ path, body })
      groceries = '40.00'
      return jsonResponse({ id: 1, ...body }, 201)
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  return { fetchMock, posts, totalsPaths }
}

async function renderCategories() {
  const result = renderApp('/categories')
  await screen.findByRole('heading', { level: 1, name: 'Categories' })
  return result
}

function rowOf(name: string) {
  return screen.getByText(name).closest('li')!
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CategoriesPage — transactions and totals', () => {
  it('shows $0.00 on every row and requests the current month', async () => {
    const { totalsPaths } = setup()
    await renderCategories()
    fireEvent.click(await screen.findByRole('button', { name: 'Food' }))

    await waitFor(() => expect(within(rowOf('Groceries')).getByText('$0.00')).toBeInTheDocument())
    expect(within(rowOf('Food')).getAllByText('$0.00').length).toBeGreaterThan(0)
    expect(within(rowOf('Other')).getByText('$0.00')).toBeInTheDocument()
    expect(screen.getByLabelText('Period')).toHaveValue('month')
    expect(totalsPaths[0]).toBe('/api/categories/totals?from=2026-10-01&to=2026-10-31')
  })

  it('opens the dialog with type, category and subcategory preset and locked, saves, updates totals', async () => {
    const { posts } = setup()
    await renderCategories()
    fireEvent.click(await screen.findByRole('button', { name: 'Food' }))
    const add = screen.getByRole('button', { name: 'Add expense to Groceries' })
    add.focus()
    fireEvent.click(add)

    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' })
    expect(within(dialog).getByRole('radio', { name: 'Expense' })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: 'Expense' })).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: 'Income' })).toBeDisabled()
    expect(within(dialog).getByLabelText('Category')).toHaveValue('1')
    expect(within(dialog).getByLabelText('Category')).toBeDisabled()
    expect(within(dialog).getByLabelText('Subcategory')).toHaveValue('2')
    expect(within(dialog).getByLabelText('Subcategory')).toBeDisabled()
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-10-14')

    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '40' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Transaction saved.')).toBeInTheDocument()
    expect(posts).toHaveLength(1)
    expect(posts[0].body).toMatchObject({
      type: 'expense',
      date: '2026-10-14',
      amount: '40',
      category_id: 1,
      subcategory_id: 2,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Subcategory and parent update without a reload, and focus is back on the button.
    await waitFor(() => expect(within(rowOf('Groceries')).getByText('$40.00')).toBeInTheDocument())
    expect(within(rowOf('Food')).getAllByText('$40.00').length).toBeGreaterThan(0)
    expect(add).toHaveFocus()
  })

  it('offers an income button on a category without subcategories, subcategory empty', async () => {
    const { posts } = setup()
    await renderCategories()
    const add = await screen.findByRole('button', { name: 'Add income to Salary' })
    // A category with subcategories has no add-transaction button on its own row.
    expect(screen.queryByRole('button', { name: 'Add expense to Food' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add expense to Other' })).toBeInTheDocument()

    fireEvent.click(add)
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' })
    expect(within(dialog).getByRole('radio', { name: 'Income' })).toBeChecked()
    expect(within(dialog).getByLabelText('Category')).toHaveValue('5')
    expect(within(dialog).getByLabelText('Subcategory')).toHaveValue('')
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0].body).toMatchObject({ type: 'income', category_id: 5, subcategory_id: null })
  })

  it('closes with Escape or Cancel and returns focus to the button', async () => {
    setup()
    await renderCategories()
    const add = await screen.findByRole('button', { name: 'Add income to Salary' })
    add.focus()
    fireEvent.click(add)
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(add).toHaveFocus()

    fireEvent.click(add)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(add).toHaveFocus()
  })

  it('refetches the totals with the range of the chosen period', async () => {
    const { totalsPaths } = setup()
    await renderCategories()
    await waitFor(() => expect(totalsPaths).toHaveLength(1))

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'year' } })
    await waitFor(() =>
      expect(totalsPaths).toContain('/api/categories/totals?from=2026-01-01&to=2026-10-14'),
    )

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-31' } })
    await waitFor(() =>
      expect(totalsPaths).toContain('/api/categories/totals?from=2026-03-01&to=2026-03-31'),
    )
  })

  it('shows an error with retry when the totals fail, keeping the tree usable', async () => {
    let fail = true
    setup({
      totals: () =>
        fail ? new Response('boom', { status: 500 }) : jsonResponse(totalsFor('12.00')),
    })
    await renderCategories()

    expect(
      await screen.findByText('Could not load totals.', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Food' })).toBeInTheDocument()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    await waitFor(() => expect(within(rowOf('Groceries')).getByText('$12.00')).toBeInTheDocument())
    expect(screen.queryByText('Could not load totals.')).not.toBeInTheDocument()
  })

  it('shows a loading status while the totals are pending', async () => {
    setup({ totals: () => new Promise<Response>(() => {}) as unknown as Response })
    await renderCategories()
    expect(await screen.findByText('Loading totals…')).toHaveAttribute('role', 'status')
  })
})
