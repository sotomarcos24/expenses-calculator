import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CategoryAmountRead, CategoryTreeNode } from '../api/types.ts'
import { DESKTOP_WIDTH, installMatchMedia } from '../test/matchMedia.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

const CATEGORIES: CategoryTreeNode[] = [
  {
    id: 1,
    name: 'Housing',
    kind: 'expense',
    parent_id: null,
    subcategories: [
      { id: 2, name: 'Rent', kind: 'expense', parent_id: 1 },
      { id: 3, name: 'Utilities', kind: 'expense', parent_id: 1 },
    ],
  },
  { id: 4, name: 'Other', kind: 'expense', parent_id: null, subcategories: [] },
  { id: 5, name: 'Salary', kind: 'income', parent_id: null, subcategories: [] },
]

const RENT: CategoryAmountRead = {
  id: 10,
  category_id: 1,
  subcategory_id: 2,
  amount: '1000.00',
  note: 'Flat',
}
const UTILITIES: CategoryAmountRead = {
  id: 11,
  category_id: 1,
  subcategory_id: 3,
  amount: '150.50',
  note: null,
}

type Call = { method: string; path: string; body: unknown }

function setup(initial: CategoryAmountRead[] = [], options: { failPut?: Response } = {}) {
  let amounts = structuredClone(initial)
  let nextId = 100
  const calls: Call[] = []
  const paths: string[] = []
  const fetchMock = mockMe(200, (path, init) => {
    const method = (init.method ?? 'GET').toUpperCase()
    paths.push(path)
    if (path === '/api/categories' && method === 'GET') {
      return jsonResponse(CATEGORIES)
    }
    if (path === '/api/categories/3' && method === 'DELETE') {
      return jsonResponse({ detail: 'Category has monthly amounts; remove them first' }, 409)
    }
    if (path === '/api/category-amounts' && method === 'GET') {
      return jsonResponse(amounts)
    }
    if (path === '/api/category-amounts' && method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      calls.push({ method, path, body })
      if (options.failPut) {
        return options.failPut
      }
      const existing = amounts.find(
        (a) => a.category_id === body.category_id && a.subcategory_id === body.subcategory_id,
      )
      const row = {
        id: existing?.id ?? nextId++,
        category_id: body.category_id,
        subcategory_id: body.subcategory_id,
        amount: Number(body.amount).toFixed(2),
        note: body.note,
      } as CategoryAmountRead
      amounts = [...amounts.filter((a) => a !== existing), row]
      return jsonResponse(row, existing ? 200 : 201)
    }
    if (path.startsWith('/api/category-amounts/') && method === 'DELETE') {
      calls.push({ method, path, body: undefined })
      amounts = amounts.filter((a) => `/api/category-amounts/${a.id}` !== path)
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  })
  return { fetchMock, calls, paths, getAmounts: () => amounts }
}

async function renderPage() {
  installMatchMedia(DESKTOP_WIDTH)
  const result = renderApp('/categories')
  await screen.findByRole('heading', { name: 'Categories' })
  fireEvent.click(await screen.findByRole('button', { name: 'Housing' }))
  return result
}

const money = (value: string) => new RegExp(`^${value.replace(/[$.]/g, '\\$&')} / month$`)

describe('CategoriesPage monthly amounts', () => {
  it('has no period selector, totals request or transaction dialog', async () => {
    const { paths } = setup()
    await renderPage()
    await screen.findByRole('button', { name: 'Add monthly amount to Rent' })

    expect(screen.queryByLabelText('Period')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Add (expense|income) to / })).toBeNull()
    expect(paths.some((path) => path.startsWith('/api/categories/totals'))).toBe(false)
  })

  it('offers add only on subcategories and categories without subcategories', async () => {
    setup()
    await renderPage()

    for (const name of ['Rent', 'Utilities', 'Other', 'Salary']) {
      expect(
        await screen.findByRole('button', { name: `Add monthly amount to ${name}` }),
      ).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Add monthly amount to Housing' })).toBeNull()
  })

  it('opens a dialog with only Amount and Note, and the row as read-only context', async () => {
    setup()
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add monthly amount to Rent' }))

    const dialog = await screen.findByRole('dialog', { name: 'Monthly amount for Housing / Rent' })
    expect(
      within(dialog)
        .getAllByRole('textbox')
        .map((box) => box.getAttribute('id')),
    ).toHaveLength(2)
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('')
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('')
    for (const label of ['Date', 'Type', 'Category', 'Subcategory', 'Gross amount']) {
      expect(within(dialog).queryByLabelText(label)).toBeNull()
    }
  })

  it.each(['', '0', '0.00', '-5', 'abc', '1.234'])(
    'rejects the amount %j without sending a request',
    async (value) => {
      const { calls } = setup()
      await renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Add monthly amount to Rent' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

      await waitFor(() =>
        expect(within(dialog).getByLabelText('Amount')).toHaveAccessibleDescription(/\w/),
      )
      expect(within(dialog).getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true')
      expect(calls).toHaveLength(0)
    },
  )

  it('creates an amount: sends the row, closes and shows it as monthly', async () => {
    const { calls } = setup()
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add monthly amount to Rent' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: ' 1000 ' } })
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), {
      target: { value: ' Flat ' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls).toEqual([
      {
        method: 'PUT',
        path: '/api/category-amounts',
        body: { category_id: 1, subcategory_id: 2, amount: '1000', note: 'Flat' },
      },
    ])
    expect(await screen.findAllByText(money('$1,000.00'))).toHaveLength(2)
    expect(await screen.findByText('Monthly amount saved.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add monthly amount to Rent' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit monthly amount of Rent' })).toBeInTheDocument()
  })

  it('sends a category without subcategories with subcategory_id null and an empty note as null', async () => {
    const { calls } = setup()
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add monthly amount to Other' }))
    const dialog = await screen.findByRole('dialog', { name: 'Monthly amount for Other' })
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '25.5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toEqual({
      category_id: 4,
      subcategory_id: null,
      amount: '25.5',
      note: null,
    })
  })

  it('edit pre-fills amount and note and updates the same row', async () => {
    const { calls, getAmounts } = setup([RENT])
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit monthly amount of Rent' }))
    const dialog = await screen.findByRole('dialog', { name: 'Monthly amount for Housing / Rent' })
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('1000.00')
    expect(within(dialog).getByLabelText('Note (optional)')).toHaveValue('Flat')

    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '1200' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(calls[0].body).toEqual({
      category_id: 1,
      subcategory_id: 2,
      amount: '1200',
      note: 'Flat',
    })
    expect(getAmounts()).toHaveLength(1)
    expect((await screen.findAllByText(money('$1,200.00'))).length).toBeGreaterThan(0)
  })

  it('shows a server error in the dialog and keeps the typed values', async () => {
    setup([], { failPut: jsonResponse({ detail: 'Category not found' }, 404) })
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Add monthly amount to Rent' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '80' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Category not found')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('80')
  })

  it('shows the sum of its own and its subcategories amounts on a parent row', async () => {
    setup([RENT, UTILITIES])
    await renderPage()

    const row = (await screen.findByRole('button', { name: 'Housing' })).closest('li')!
    const parent = row.firstElementChild as HTMLElement
    expect(await within(parent).findByText(money('$1,150.50'))).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Housing subcategories' })
    expect(within(list).getByText(money('$1,000.00'))).toBeInTheDocument()
    expect(within(list).getByText(money('$150.50'))).toBeInTheDocument()
    // A parent has no add / edit amount of its own.
    expect(within(parent).queryByRole('button', { name: /monthly amount/ })).toBeNull()
  })

  it('deletes an amount after a confirmation, and Cancel keeps it', async () => {
    const { calls, getAmounts } = setup([RENT])
    await renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete monthly amount of Rent' }))
    const group = screen.getByRole('group', { name: 'Confirm delete' })
    expect(group).toHaveTextContent('Remove the monthly amount of "Rent"?')
    fireEvent.click(within(group).getByRole('button', { name: 'Cancel' }))
    expect(calls).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete monthly amount of Rent' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Confirm delete' })).getByRole('button', {
        name: 'Delete',
      }),
    )

    await waitFor(() => expect(getAmounts()).toHaveLength(0))
    expect(calls).toEqual([{ method: 'DELETE', path: '/api/category-amounts/10', body: undefined }])
    expect(await screen.findByText('Monthly amount removed.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(money('$1,000.00'))).toBeNull())
    expect(screen.getByRole('button', { name: 'Add monthly amount to Rent' })).toBeInTheDocument()
  })

  it('invalidates the amounts, dashboard and category totals queries after save and delete', async () => {
    setup([RENT])
    const { queryClient } = await renderPage()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const invalidated = () => spy.mock.calls.map(([filters]) => filters?.queryKey)

    fireEvent.click(await screen.findByRole('button', { name: 'Add monthly amount to Utilities' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '30' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    for (const key of ['category-amounts', 'dashboard', 'category-totals']) {
      expect(invalidated()).toContainEqual([key])
    }

    spy.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Delete monthly amount of Rent' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Confirm delete' })).getByRole('button', {
        name: 'Delete',
      }),
    )
    await waitFor(() => expect(invalidated()).toContainEqual(['category-amounts']))
    expect(invalidated()).toContainEqual(['dashboard'])
    expect(invalidated()).toContainEqual(['category-totals'])
  })

  it('shows the 409 message when deleting a category that has amounts and keeps it', async () => {
    setup([UTILITIES])
    await renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Utilities' }))
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Confirm delete' })).getByRole('button', {
        name: 'Delete',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Category has monthly amounts; remove them first',
    )
    expect(
      screen.getByRole('button', { name: 'Edit monthly amount of Utilities' }),
    ).toBeInTheDocument()
  })
})
