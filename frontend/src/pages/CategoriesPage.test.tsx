import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CategoryKind, CategoryTreeNode } from '../api/types.ts'
import { DESKTOP_WIDTH, installMatchMedia, MOBILE_WIDTH, resizeTo } from '../test/matchMedia.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

type Handler = Parameters<typeof mockMe>[1]

let nextId = 1

function tree(kind: CategoryKind, spec: [string, string[]][]): CategoryTreeNode[] {
  return spec.map(([name, children]) => {
    const id = nextId++
    return {
      id,
      name,
      kind,
      parent_id: null,
      subcategories: children.map((child) => ({
        id: nextId++,
        name: child,
        kind,
        parent_id: id,
      })),
    }
  })
}

const DEFAULT_EXPENSES = tree('expense', [
  ['Housing', ['Rent', 'Mortgage', 'Utilities']],
  ['Food', ['Groceries', 'Restaurants']],
  ['Transport', ['Fuel', 'Car payment', 'Train', 'Metro']],
  ['Leisure', ['Nightlife', 'Travel', 'Weekends']],
  ['Other', []],
])

const DEFAULT_INCOME = tree('income', [
  ['Salary', []],
  ['Rental income', []],
  ['Dividends', []],
  ['Other income', []],
])

const DEFAULT_TREE = [...DEFAULT_EXPENSES, ...DEFAULT_INCOME]

function categoriesCalls(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.filter(
    ([path]) =>
      String(path).startsWith('/api/categories') &&
      !String(path).startsWith('/api/categories/totals'),
  )
}

function answer(body: CategoryTreeNode[]): Handler {
  return (path) => {
    if (path === '/api/categories') {
      return jsonResponse(body)
    }
    if (path.startsWith('/api/categories/totals')) {
      return jsonResponse([])
    }
    throw new Error(`Unexpected request: ${path}`)
  }
}

async function renderCategories(handler: Handler = answer(DEFAULT_TREE)) {
  const fetchMock = mockMe(200, handler)
  const result = renderApp('/categories')
  await screen.findByRole('heading', { name: 'Categories' })
  return { ...result, fetchMock }
}

function topLevelNames(listName: string) {
  const list = screen.getByRole('list', { name: listName })
  return within(list)
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === list)
    .map((item) => item.querySelector('button, p')?.textContent)
}

function visibleSubcategories(name: string) {
  const list = screen.queryByRole('list', { name: `${name} subcategories` })
  return list
    ? within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    : []
}

describe('CategoriesPage', () => {
  it('shows a loading indicator while the request is pending', async () => {
    await renderCategories(() => new Promise<Response>(() => {}))
    expect(await screen.findByRole('status')).toHaveTextContent('Loading categories…')
  })

  it('renders the default expense and income trees in API order', async () => {
    const { fetchMock } = await renderCategories()

    expect(await screen.findByRole('heading', { name: 'Expenses' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Income' })).toBeInTheDocument()
    expect(topLevelNames('Expense categories')).toEqual([
      'Housing',
      'Food',
      'Transport',
      'Leisure',
      'Other',
    ])
    expect(topLevelNames('Income categories')).toEqual([
      'Salary',
      'Rental income',
      'Dividends',
      'Other income',
    ])
    // Expenses section comes first.
    const [first, second] = screen.getAllByRole('tabpanel', { hidden: true })
    expect(first).toHaveAccessibleName('Expenses')
    expect(second).toHaveAccessibleName('Income')

    const calls = categoriesCalls(fetchMock)
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('/api/categories')
  })

  it('does not re-sort a non-alphabetical response', async () => {
    const body = [
      ...tree('expense', [
        ['Zoo', ['Zebra', 'Ant']],
        ['Alpha', []],
        ['Mid', []],
      ]),
      ...tree('income', [
        ['Wages', []],
        ['Bonus', []],
      ]),
    ]
    await renderCategories(answer(body))

    expect(await screen.findByRole('list', { name: 'Expense categories' })).toBeInTheDocument()
    expect(topLevelNames('Expense categories')).toEqual(['Zoo', 'Alpha', 'Mid'])
    expect(topLevelNames('Income categories')).toEqual(['Wages', 'Bonus'])
    fireEvent.click(screen.getByRole('button', { name: 'Zoo' }))
    expect(visibleSubcategories('Zoo')).toEqual(['Zebra', 'Ant'])
  })

  it('starts collapsed and toggles subcategories in order', async () => {
    await renderCategories()

    const housing = await screen.findByRole('button', { name: 'Housing' })
    expect(housing).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Rent')).not.toBeVisible()
    expect(document.getElementById(housing.getAttribute('aria-controls')!)).not.toBeVisible()

    fireEvent.click(housing)
    expect(housing).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Rent')).toBeVisible()
    expect(visibleSubcategories('Housing')).toEqual(['Rent', 'Mortgage', 'Utilities'])
    // Subcategories are plain text, without an expander.
    expect(screen.queryByRole('button', { name: 'Rent' })).not.toBeInTheDocument()

    // Several categories can be open at once.
    fireEvent.click(screen.getByRole('button', { name: 'Transport' }))
    expect(visibleSubcategories('Transport')).toEqual(['Fuel', 'Car payment', 'Train', 'Metro'])
    expect(visibleSubcategories('Housing')).toEqual(['Rent', 'Mortgage', 'Utilities'])

    fireEvent.click(housing)
    expect(housing).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Rent')).not.toBeVisible()
    expect(visibleSubcategories('Transport')).toHaveLength(4)
  })

  it('renders categories without subcategories with no expander button', async () => {
    await renderCategories()
    await screen.findByRole('button', { name: 'Housing' })

    for (const name of ['Other', 'Salary', 'Rental income', 'Dividends', 'Other income']) {
      expect(screen.getByText(name)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(
      screen.getAllByRole('button', { expanded: false }).map((button) => button.textContent),
    ).toEqual(['Housing', 'Food', 'Transport', 'Leisure'])
  })

  it('switches between the Expenses and Income tabs', async () => {
    await renderCategories()
    const expensesTab = await screen.findByRole('tab', { name: 'Expenses' })
    const incomeTab = screen.getByRole('tab', { name: 'Income' })
    const expensesPanel = document.getElementById(expensesTab.getAttribute('aria-controls')!)!
    const incomePanel = document.getElementById(incomeTab.getAttribute('aria-controls')!)!

    expect(expensesTab).toHaveAttribute('aria-selected', 'true')
    expect(incomeTab).toHaveAttribute('aria-selected', 'false')
    expect(expensesPanel).toHaveAttribute('data-state', 'active')
    expect(incomePanel).toHaveAttribute('data-state', 'inactive')
    expect(incomePanel).toHaveClass('hidden', 'md:block')

    fireEvent.click(incomeTab)
    expect(incomeTab).toHaveAttribute('aria-selected', 'true')
    expect(expensesTab).toHaveAttribute('aria-selected', 'false')
    expect(incomePanel).toHaveAttribute('data-state', 'active')
    expect(incomePanel).not.toHaveClass('hidden')
    expect(expensesPanel).toHaveAttribute('data-state', 'inactive')

    fireEvent.keyDown(incomeTab, { key: 'ArrowLeft' })
    expect(expensesTab).toHaveAttribute('aria-selected', 'true')
    expect(expensesTab).toHaveFocus()
  })

  it('shows an error with "Try again" and renders the tree once a retry succeeds', async () => {
    let fail = true
    const { fetchMock } = await renderCategories((path) => {
      if (path.startsWith('/api/categories/totals')) {
        return jsonResponse([])
      }
      if (path !== '/api/categories') {
        throw new Error(`Unexpected request: ${path}`)
      }
      return fail
        ? new Response('Internal Server Error', { status: 500 })
        : jsonResponse(DEFAULT_TREE)
    })

    // The query client retries once (after ~1 s) before showing the error.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Could not load categories.',
    )
    const callsBefore = categoriesCalls(fetchMock).length

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Housing' })).toBeInTheDocument()
    expect(categoriesCalls(fetchMock).length).toBe(callsBefore + 1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an empty message for a kind with no categories', async () => {
    await renderCategories(answer(DEFAULT_EXPENSES))

    expect(await screen.findByText('No income categories yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Income categories' })).not.toBeInTheDocument()
    expect(screen.queryByText('No expense categories yet.')).not.toBeInTheDocument()
  })
})

type Request = { method: string; path: string; body: unknown }

/**
 * In-memory categories API. `override` can answer a request first (return `undefined` to let
 * the fake server handle it). Mutations are recorded in `requests` (GETs are not).
 */
function fakeServer(
  initial: CategoryTreeNode[] = DEFAULT_TREE,
  override?: (request: Request) => Response | Promise<Response> | undefined,
) {
  let data: CategoryTreeNode[] = structuredClone(initial)
  let id = 1000
  const requests: Request[] = []

  const handler: Handler = (path, init) => {
    const method = (init.method ?? 'GET').toUpperCase()
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    if (!path.startsWith('/api/categories')) {
      throw new Error(`Unexpected request: ${path}`)
    }
    if (method === 'GET') {
      return jsonResponse(data)
    }
    const request = { method, path, body }
    requests.push(request)
    const overridden = override?.(request)
    if (overridden) {
      return overridden
    }
    const targetId = Number(path.split('/').pop())
    if (method === 'POST') {
      const created = {
        id: id++,
        name: body.name,
        kind: body.kind,
        parent_id: body.parent_id ?? null,
      }
      if (created.parent_id === null) {
        data.push({ ...created, subcategories: [] })
      } else {
        data.find((category) => category.id === created.parent_id)!.subcategories.push(created)
      }
      return jsonResponse(created, 201)
    }
    if (method === 'PATCH') {
      for (const category of data) {
        for (const item of [category, ...category.subcategories]) {
          if (item.id === targetId) {
            item.name = body.name
          }
        }
      }
      return jsonResponse({ id: targetId, name: body.name })
    }
    if (method === 'DELETE') {
      data = data
        .filter((category) => category.id !== targetId)
        .map((category) => ({
          ...category,
          subcategories: category.subcategories.filter((sub) => sub.id !== targetId),
        }))
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected method: ${method}`)
  }
  return { handler, requests }
}

const DUPLICATE = 'A category with this name already exists at this level'
const IN_USE = 'This category or one of its subcategories has transactions'

function idOf(name: string) {
  for (const category of DEFAULT_TREE) {
    if (category.name === name) return category.id
    const sub = category.subcategories.find((item) => item.name === name)
    if (sub) return sub.id
  }
  throw new Error(`No category ${name}`)
}

function section(name: 'Expenses' | 'Income') {
  return screen.getByRole('tabpanel', { name })
}

async function renderManaged(
  initial: CategoryTreeNode[] = DEFAULT_TREE,
  override?: Parameters<typeof fakeServer>[1],
) {
  const server = fakeServer(initial, override)
  const result = await renderCategories(server.handler)
  await screen.findByRole('heading', { name: 'Expenses' })
  return { ...result, requests: server.requests }
}

function typeAndSubmit(label: string, value: string) {
  const input = screen.getByRole('textbox', { name: label })
  fireEvent.change(input, { target: { value } })
  fireEvent.submit((input as HTMLInputElement).form!)
  return input
}

function getCategoriesCount(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.filter(
    ([path, init]) =>
      path === '/api/categories' && ((init as RequestInit)?.method ?? 'GET') === 'GET',
  ).length
}

describe('CategoriesPage — toasts', () => {
  it('shows a success toast for add, subcategory add, rename and delete, and no toast on failure', async () => {
    await renderManaged()
    fireEvent.click(screen.getByRole('button', { name: 'Add subcategory to Food' }))
    typeAndSubmit('Subcategory name', 'Snacks')
    expect(await screen.findByText('Subcategory added.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Transport' }))
    typeAndSubmit('Name', 'Travel')
    expect(await screen.findByText('Category renamed.')).toBeInTheDocument()

    fireEvent.click(within(section('Expenses')).getByRole('button', { name: 'Add category' }))
    typeAndSubmit('Category name', 'Pets')
    expect(await screen.findByText('Category added.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Pets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Category deleted.')).toBeInTheDocument()
    expect(screen.getByText('Category deleted.').parentElement).toHaveAttribute('role', 'status')
  })

  it('shows no success toast when a save fails', async () => {
    await renderManaged(DEFAULT_TREE, () => jsonResponse({ detail: DUPLICATE }, 409))
    fireEvent.click(within(section('Expenses')).getByRole('button', { name: 'Add category' }))
    typeAndSubmit('Category name', 'Food')
    expect(await screen.findByText(DUPLICATE)).toBeInTheDocument()
    expect(screen.queryByText('Category added.')).not.toBeInTheDocument()
  })
})

describe('CategoriesPage — managing categories', () => {
  it('adds a top-level expense category with a trimmed name at the end', async () => {
    const { requests } = await renderManaged()

    fireEvent.click(within(section('Expenses')).getByRole('button', { name: 'Add category' }))
    const input = screen.getByRole('textbox', { name: 'Category name' })
    expect(input).toHaveFocus()
    typeAndSubmit('Category name', '  Health  ')

    expect(await within(section('Expenses')).findByText('Health')).toBeInTheDocument()
    expect(requests).toEqual([
      { method: 'POST', path: '/api/categories', body: { name: 'Health', kind: 'expense' } },
    ])
    expect(topLevelNames('Expense categories')).toEqual([
      'Housing',
      'Food',
      'Transport',
      'Leisure',
      'Other',
      'Health',
    ])
    expect(screen.queryByRole('textbox', { name: 'Category name' })).not.toBeInTheDocument()
  })

  it('adds an income category', async () => {
    const { requests } = await renderManaged()

    fireEvent.click(screen.getByRole('tab', { name: 'Income' }))
    fireEvent.click(within(section('Income')).getByRole('button', { name: 'Add category' }))
    typeAndSubmit('Category name', 'Bonus')

    expect(await within(section('Income')).findByText('Bonus')).toBeInTheDocument()
    expect(requests[0].body).toEqual({ name: 'Bonus', kind: 'income' })
    expect(topLevelNames('Income categories').at(-1)).toBe('Bonus')
  })

  it('adds a subcategory at the end of a collapsed parent and expands it', async () => {
    const { requests } = await renderManaged()
    const food = screen.getByRole('button', { name: 'Food' })
    expect(food).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Add subcategory to Food' }))
    expect(food).toHaveAttribute('aria-expanded', 'true')
    const input = screen.getByRole('textbox', { name: 'Subcategory name' })
    expect(input).toHaveFocus()
    expect(input.closest('ul')).toHaveAccessibleName('Food subcategories')
    typeAndSubmit('Subcategory name', 'Coffee')

    await waitFor(() =>
      expect(visibleSubcategories('Food')).toEqual(['Groceries', 'Restaurants', 'Coffee']),
    )
    expect(requests[0].body).toEqual({ name: 'Coffee', kind: 'expense', parent_id: idOf('Food') })
    expect(food).toHaveAttribute('aria-expanded', 'true')
  })

  it('makes a category without subcategories expandable after adding one', async () => {
    const { requests } = await renderManaged()
    expect(screen.queryByRole('button', { name: 'Salary' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add subcategory to Salary' }))
    typeAndSubmit('Subcategory name', 'Overtime')

    const salary = await screen.findByRole('button', { name: 'Salary' })
    expect(salary).toHaveAttribute('aria-expanded', 'true')
    expect(visibleSubcategories('Salary')).toEqual(['Overtime'])
    expect(requests[0].body).toEqual({
      name: 'Overtime',
      kind: 'income',
      parent_id: idOf('Salary'),
    })
  })

  it('offers only Rename and Delete on subcategories', async () => {
    await renderManaged()
    fireEvent.click(screen.getByRole('button', { name: 'Housing' }))

    expect(screen.getByRole('button', { name: 'Rename Rent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Rent' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add subcategory to Rent' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add subcategory to Housing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rename Housing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Housing' })).toBeInTheDocument()
  })

  it('renames a category in place', async () => {
    const { requests } = await renderManaged()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Transport' }))
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveValue('Transport')
    expect(input).toHaveFocus()
    typeAndSubmit('Name', 'Commute')

    expect(await screen.findByRole('button', { name: 'Commute' })).toBeInTheDocument()
    expect(requests).toEqual([
      { method: 'PATCH', path: `/api/categories/${idOf('Transport')}`, body: { name: 'Commute' } },
    ])
    expect(topLevelNames('Expense categories')).toEqual([
      'Housing',
      'Food',
      'Commute',
      'Leisure',
      'Other',
    ])
  })

  it('renames a subcategory', async () => {
    const { requests } = await renderManaged()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))

    fireEvent.click(screen.getByRole('button', { name: 'Rename Groceries' }))
    typeAndSubmit('Name', 'Supermarket')

    await waitFor(() =>
      expect(visibleSubcategories('Food')).toEqual(['Supermarket', 'Restaurants']),
    )
    expect(requests[0]).toEqual({
      method: 'PATCH',
      path: `/api/categories/${idOf('Groceries')}`,
      body: { name: 'Supermarket' },
    })
  })

  it('sends no request for Escape or an unchanged name, but sends a case-only rename', async () => {
    const { requests } = await renderManaged()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Transport' }))
    const input = screen.getByRole('textbox', { name: 'Name' })
    fireEvent.change(input, { target: { value: 'Something else' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transport' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Transport' }))
    typeAndSubmit('Name', ' Transport ')
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(requests).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    typeAndSubmit('Name', 'FOOD')
    expect(await screen.findByRole('button', { name: 'FOOD' })).toBeInTheDocument()
    expect(requests).toEqual([
      { method: 'PATCH', path: `/api/categories/${idOf('Food')}`, body: { name: 'FOOD' } },
    ])
  })

  it('asks for confirmation before deleting a category and its subcategories', async () => {
    const { requests } = await renderManaged()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Housing' }))
    expect(screen.getByText('Delete "Housing" and its 3 subcategories?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/Delete "Housing"/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Housing' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' })
    expect(screen.queryByText(/Delete "Housing"/)).not.toBeInTheDocument()
    expect(requests).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Housing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Housing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Housing' })).not.toBeInTheDocument(),
    )
    for (const name of ['Rent', 'Mortgage', 'Utilities']) {
      expect(screen.queryByText(name)).not.toBeInTheDocument()
    }
    expect(requests).toEqual([
      { method: 'DELETE', path: `/api/categories/${idOf('Housing')}`, body: undefined },
    ])
    expect(topLevelNames('Expense categories')).toEqual(['Food', 'Transport', 'Leisure', 'Other'])
  })

  it('words the confirmation for a single subcategory, a leaf and a subcategory', async () => {
    const body = [
      ...tree('expense', [
        ['Pets', ['Vet']],
        ['Gifts', []],
      ]),
    ]
    await renderManaged(body)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Pets' }))
    expect(screen.getByText('Delete "Pets" and its 1 subcategory?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Gifts' }))
    expect(screen.queryByText(/Delete "Pets"/)).not.toBeInTheDocument()
    expect(screen.getByText('Delete "Gifts"?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pets' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Vet' }))
    expect(screen.getByText('Delete "Vet"?')).toBeInTheDocument()
  })

  it('deletes a subcategory', async () => {
    const { requests } = await renderManaged()
    fireEvent.click(screen.getByRole('button', { name: 'Food' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Restaurants' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(visibleSubcategories('Food')).toEqual(['Groceries']))
    expect(requests[0].path).toBe(`/api/categories/${idOf('Restaurants')}`)
  })

  it('validates names on the client without sending a request', async () => {
    const { requests } = await renderManaged()

    fireEvent.click(within(section('Expenses')).getByRole('button', { name: 'Add category' }))
    typeAndSubmit('Category name', '   ')
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required')
    expect(screen.getByRole('textbox', { name: 'Category name' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    typeAndSubmit('Category name', 'a'.repeat(101))
    expect(screen.getByRole('alert')).toHaveTextContent('Name must be at most 100 characters')
    expect(requests).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    typeAndSubmit('Name', '')
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required')
    expect(requests).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(within(section('Expenses')).getByRole('button', { name: 'Add category' }))
    typeAndSubmit('Category name', 'b'.repeat(100))
    expect(await screen.findByText('b'.repeat(100))).toBeInTheDocument()
    expect(requests).toEqual([
      { method: 'POST', path: '/api/categories', body: { name: 'b'.repeat(100), kind: 'expense' } },
    ])
  })

  it('shows a duplicate 409 next to the add input and keeps the typed text', async () => {
    const { requests } = await renderManaged(DEFAULT_TREE, ({ method }) =>
      method === 'POST' ? jsonResponse({ detail: DUPLICATE }, 409) : undefined,
    )

    fireEvent.click(within(section('Expenses')).getByRole('button', { name: 'Add category' }))
    typeAndSubmit('Category name', 'food')

    expect(await screen.findByRole('alert')).toHaveTextContent(DUPLICATE)
    expect(screen.getByRole('textbox', { name: 'Category name' })).toHaveValue('food')
    expect(requests).toHaveLength(1)
    expect(topLevelNames('Expense categories')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a duplicate 409 next to the rename input and keeps the typed text', async () => {
    await renderManaged(DEFAULT_TREE, ({ method }) =>
      method === 'PATCH' ? jsonResponse({ detail: DUPLICATE }, 409) : undefined,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rename Leisure' }))
    typeAndSubmit('Name', 'Food')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(DUPLICATE)
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveValue('Food')
    expect(alert.closest('li')).toBe(input.closest('li'))

    // Starting another action clears the message.
    fireEvent.click(screen.getByRole('button', { name: 'Delete Other' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leisure' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Food' })).toBeInTheDocument()
  })

  it('shows the in-use 409 on the row after a failed delete and keeps the category', async () => {
    await renderManaged(DEFAULT_TREE, ({ method }) =>
      method === 'DELETE' ? jsonResponse({ detail: IN_USE }, 409) : undefined,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete Food' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(IN_USE)
    expect(alert.closest('li')).toBe(screen.getByRole('button', { name: 'Food' }).closest('li'))
    expect(screen.queryByText(/Delete "Food"/)).not.toBeInTheDocument()
    expect(topLevelNames('Expense categories')).toContain('Food')
  })

  it('shows the generic message on a 500', async () => {
    await renderManaged(DEFAULT_TREE, () => new Response('oops', { status: 500 }))

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    typeAndSubmit('Name', 'Meals')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Meals')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Other' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('shows "Category not found" on a 404 and refetches the tree', async () => {
    const { fetchMock } = await renderManaged(DEFAULT_TREE, ({ method }) =>
      method === 'PATCH' ? jsonResponse({ detail: 'Category not found' }, 404) : undefined,
    )
    const before = getCategoriesCount(fetchMock)

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    typeAndSubmit('Name', 'Meals')

    expect(await screen.findByRole('alert')).toHaveTextContent('Category not found')
    expect(getCategoriesCount(fetchMock)).toBe(before + 1)
  })

  it('disables Save and Delete while a request is pending', async () => {
    let release: (response: Response) => void = () => {}
    const { requests } = await renderManaged(DEFAULT_TREE, ({ method }) =>
      method === 'DELETE' || method === 'POST'
        ? new Promise<Response>((resolve) => {
            release = resolve
          })
        : undefined,
    )

    fireEvent.click(within(section('Expenses')).getByRole('button', { name: 'Add category' }))
    typeAndSubmit('Category name', 'Health')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled())
    fireEvent.submit(
      (screen.getByRole('textbox', { name: 'Category name' }) as HTMLInputElement).form!,
    )
    expect(requests).toHaveLength(1)
    release(jsonResponse({ detail: DUPLICATE }, 409))
    expect(await screen.findByRole('alert')).toHaveTextContent(DUPLICATE)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Other' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(requests).toHaveLength(2)
    release(new Response(null, { status: 204 }))
    await waitFor(() => expect(screen.queryByText('Delete "Other"?')).not.toBeInTheDocument())
  })

  it('keeps only one inline editor open at a time', async () => {
    await renderManaged()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Transport' }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Salary' }))
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
    expect(screen.getByText('Delete "Salary"?')).toBeInTheDocument()

    fireEvent.click(within(section('Expenses')).getByRole('button', { name: 'Add category' }))
    expect(screen.queryByText('Delete "Salary"?')).not.toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Add subcategory to Food' }))
    expect(screen.queryByRole('textbox', { name: 'Category name' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
  })

  it('keeps expanded categories expanded after a change', async () => {
    await renderManaged()
    fireEvent.click(screen.getByRole('button', { name: 'Transport' }))

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    typeAndSubmit('Name', 'Meals')
    expect(await screen.findByRole('button', { name: 'Meals' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Transport' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Meals' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('offers "Add category" in an empty section and adds one', async () => {
    const { requests } = await renderManaged(DEFAULT_EXPENSES)

    const income = section('Income')
    expect(within(income).getByText('No income categories yet.')).toBeInTheDocument()
    fireEvent.click(within(income).getByRole('button', { name: 'Add category' }))
    typeAndSubmit('Category name', 'Salary')

    expect(await within(section('Income')).findByText('Salary')).toBeInTheDocument()
    expect(requests[0].body).toEqual({ name: 'Salary', kind: 'income' })
    expect(screen.queryByText('No income categories yet.')).not.toBeInTheDocument()
  })

  it('shows the empty message and "Add category" after deleting every income category', async () => {
    const body = [...DEFAULT_EXPENSES, ...tree('income', [['Wages', []]])]
    await renderManaged(body)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Wages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('No income categories yet.')).toBeInTheDocument()
    expect(within(section('Income')).getByRole('button', { name: 'Add category' })).toBeEnabled()
  })
})

function tab(name: 'Expenses' | 'Income') {
  return screen.getByRole('tab', { name })
}

function panelOf(name: 'Expenses' | 'Income') {
  return document.getElementById(tab(name).getAttribute('aria-controls')!)!
}

/** The Expenses / Income sections at desktop width (plain labelled `<section>`s: `region`). */
function region(name: 'Expenses' | 'Income') {
  return screen.getByRole('region', { name })
}

function expectNoTabs() {
  expect(screen.queryAllByRole('tablist', { hidden: true })).toHaveLength(0)
  expect(screen.queryAllByRole('tab', { hidden: true })).toHaveLength(0)
  expect(screen.queryAllByRole('tabpanel', { hidden: true })).toHaveLength(0)
}

function expectMobileTabs(selected: 'Expenses' | 'Income') {
  const other = selected === 'Expenses' ? 'Income' : 'Expenses'
  expect(screen.getByRole('tablist', { name: 'Category type' })).toBeInTheDocument()
  expect(tab(selected)).toHaveAttribute('aria-selected', 'true')
  expect(tab(other)).toHaveAttribute('aria-selected', 'false')
  expect(panelOf(selected)).toHaveAttribute('role', 'tabpanel')
  expect(panelOf(selected)).toHaveAttribute('data-state', 'active')
  expect(panelOf(selected)).not.toHaveClass('hidden')
  expect(panelOf(other)).toHaveAttribute('data-state', 'inactive')
  expect(panelOf(other)).toHaveClass('hidden')
}

describe('CategoriesPage — breakpoints', () => {
  it('shows both sections as labelled regions with no tab roles at 1280px', async () => {
    installMatchMedia(DESKTOP_WIDTH)
    await renderManaged()

    expectNoTabs()
    const expenses = region('Expenses')
    const income = region('Income')
    for (const element of [expenses, income]) {
      expect(element.tagName).toBe('SECTION')
      expect(element).not.toHaveAttribute('role')
      expect(element).not.toHaveAttribute('data-state')
      expect(element).not.toHaveClass('hidden')
    }
    expect(expenses.parentElement).toBe(income.parentElement)
    expect(expenses.parentElement).toHaveClass('md:grid-cols-2')
    expect(screen.getAllByRole('region').map((element) => element.id)).toEqual([
      'categories-panel-expenses',
      'categories-panel-income',
    ])
  })

  it('keeps the tabs pattern at 375px', async () => {
    await renderManaged()

    expectMobileTabs('Expenses')
    expect(tab('Expenses')).toHaveAttribute('aria-controls', 'categories-panel-expenses')
    expect(tab('Income')).toHaveAttribute('aria-controls', 'categories-panel-income')
    expect(tab('Expenses')).toHaveAttribute('tabindex', '0')
    expect(tab('Income')).toHaveAttribute('tabindex', '-1')
    expect(panelOf('Expenses')).toHaveAccessibleName('Expenses')
    expect(panelOf('Income')).toHaveAccessibleName('Income')

    fireEvent.click(tab('Income'))
    expectMobileTabs('Income')
    expect(tab('Income')).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(tab('Income'), { key: 'ArrowLeft' })
    expectMobileTabs('Expenses')
    expect(tab('Expenses')).toHaveFocus()

    fireEvent.keyDown(tab('Expenses'), { key: 'ArrowRight' })
    expectMobileTabs('Income')
    expect(tab('Income')).toHaveFocus()
  })

  it('switches between tabs and columns when resizing across md, without a reload', async () => {
    const { fetchMock } = await renderManaged()
    expectMobileTabs('Expenses')

    resizeTo(DESKTOP_WIDTH)
    expectNoTabs()
    expect(region('Expenses')).not.toHaveClass('hidden')
    expect(region('Income')).not.toHaveClass('hidden')

    resizeTo(MOBILE_WIDTH)
    expectMobileTabs('Expenses')

    fireEvent.click(tab('Income'))
    resizeTo(DESKTOP_WIDTH)
    expectNoTabs()
    resizeTo(MOBILE_WIDTH)
    expectMobileTabs('Income')

    expect(getCategoriesCount(fetchMock)).toBe(1)
  })

  for (const how of ['click', 'ArrowRight'] as const) {
    const switchToIncome = () => {
      if (how === 'click') {
        // A real click focuses the button; fireEvent does not.
        tab('Income').focus()
        fireEvent.click(tab('Income'))
      } else {
        fireEvent.keyDown(tab('Expenses'), { key: 'ArrowRight' })
      }
    }

    it(`discards an open rename input when switching tabs (${how})`, async () => {
      const { requests } = await renderManaged()

      fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Meals' },
      })
      switchToIncome()
      expectMobileTabs('Income')
      expect(tab('Income')).toHaveFocus()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

      fireEvent.click(tab('Expenses'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(within(panelOf('Expenses')).getByRole('button', { name: 'Food' })).toBeInTheDocument()
      expect(screen.queryByText('Meals')).not.toBeInTheDocument()
      expect(requests).toHaveLength(0)
    })

    it(`discards an open "Add category" input when switching tabs (${how})`, async () => {
      const { requests } = await renderManaged()

      fireEvent.click(within(panelOf('Expenses')).getByRole('button', { name: 'Add category' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Category name' }), {
        target: { value: 'Health' },
      })
      switchToIncome()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

      fireEvent.click(tab('Expenses'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(
        within(panelOf('Expenses')).getByRole('button', { name: 'Add category' }),
      ).toBeInTheDocument()
      expect(requests).toHaveLength(0)
    })

    it(`discards an open delete confirmation when switching tabs (${how})`, async () => {
      const { requests } = await renderManaged()

      fireEvent.click(screen.getByRole('button', { name: 'Delete Food' }))
      expect(screen.getByText(/Delete "Food"/)).toBeInTheDocument()
      switchToIncome()
      expect(screen.queryByText(/Delete "Food"/)).not.toBeInTheDocument()

      fireEvent.click(tab('Expenses'))
      expect(screen.queryByText(/Delete "Food"/)).not.toBeInTheDocument()
      expect(topLevelNames('Expense categories')).toContain('Food')
      expect(requests).toHaveLength(0)
    })
  }

  it('keeps the editor open when the already selected tab is clicked', async () => {
    await renderManaged()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Meals' } })
    fireEvent.click(tab('Expenses'))

    expectMobileTabs('Expenses')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Meals')

    fireEvent.keyDown(tab('Expenses'), { key: 'Enter' })
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Meals')
  })

  it('clears a failed delete error when switching tabs and back', async () => {
    await renderManaged(DEFAULT_TREE, ({ method }) =>
      method === 'DELETE' ? jsonResponse({ detail: IN_USE }, 409) : undefined,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete Food' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(IN_USE)

    fireEvent.click(tab('Income'))
    fireEvent.click(tab('Expenses'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(IN_USE)).not.toBeInTheDocument()
  })

  it('drops the error of a request that was in flight when the tab changed', async () => {
    let release: (response: Response) => void = () => {}
    await renderManaged(DEFAULT_TREE, ({ method }) =>
      method === 'PATCH'
        ? new Promise<Response>((resolve) => {
            release = resolve
          })
        : undefined,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    typeAndSubmit('Name', 'Meals')
    fireEvent.click(tab('Income'))
    release(jsonResponse({ detail: DUPLICATE }, 409))

    fireEvent.click(tab('Expenses'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Food' })).toBeEnabled())
    expect(screen.queryByText(DUPLICATE)).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it("selects the editor's tab when resizing from 1280px to 375px", async () => {
    installMatchMedia(DESKTOP_WIDTH)
    await renderManaged()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Salary' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Wages' } })
    resizeTo(MOBILE_WIDTH)

    expectMobileTabs('Income')
    const input = within(panelOf('Income')).getByRole('textbox', { name: 'Name' })
    expect(input).toHaveValue('Wages')
  })

  it('keeps the active tab when the editor is already in it on resize to mobile', async () => {
    installMatchMedia(DESKTOP_WIDTH)
    await renderManaged()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Food' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Meals' } })
    resizeTo(MOBILE_WIDTH)

    expectMobileTabs('Expenses')
    expect(within(panelOf('Expenses')).getByRole('textbox', { name: 'Name' })).toHaveValue('Meals')
  })

  it('keeps the editor and its text when resizing from 375px to 1280px', async () => {
    await renderManaged()

    fireEvent.click(tab('Income'))
    fireEvent.click(screen.getByRole('button', { name: 'Rename Salary' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Wages' } })
    resizeTo(DESKTOP_WIDTH)

    expectNoTabs()
    expect(within(region('Income')).getByRole('textbox', { name: 'Name' })).toHaveValue('Wages')
  })
})
