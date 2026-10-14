import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CategoryKind, CategoryTreeNode } from '../api/types.ts'
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
  return fetchMock.mock.calls.filter(([path]) => String(path).startsWith('/api/categories'))
}

function answer(body: CategoryTreeNode[]): Handler {
  return (path) => {
    if (path === '/api/categories') {
      return jsonResponse(body)
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
