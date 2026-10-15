import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Dashboard } from '../api/types.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

const INVESTMENTS = {
  total_invested: '0.00',
  current_value: '0.00',
  gain: '0.00',
  gain_pct: null,
  by_type: [],
}

const DATA: Dashboard = {
  income_total: '3000.00',
  expense_total: '750.00',
  savings: '2250.00',
  savings_rate: '0.7500',
  expenses_by_category: [
    {
      category_id: 1,
      name: 'Food',
      total: '500.00',
      subcategories: [
        { id: 11, name: 'Groceries', total: '350.00' },
        { id: 12, name: 'Restaurants', total: '100.00' },
        { id: null, name: '(none)', total: '50.00' },
      ],
    },
    {
      category_id: 2,
      name: 'Transport',
      total: '250.00',
      subcategories: [{ id: null, name: '(none)', total: '250.00' }],
    },
  ],
  investments: INVESTMENTS,
}

const NEGATIVE: Dashboard = {
  ...DATA,
  income_total: '0.00',
  expense_total: '100.00',
  savings: '-100.00',
  savings_rate: null,
  expenses_by_category: [],
}

function renderDashboard(handler: (params: URLSearchParams) => Dashboard | Response) {
  const calls: URLSearchParams[] = []
  mockMe(200, (path) => {
    if (path.startsWith('/api/dashboard?')) {
      const params = new URL(path, 'http://x').searchParams
      calls.push(params)
      const result = handler(params)
      return result instanceof Response ? result : jsonResponse(result)
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  renderApp('/')
  return calls
}

function kpi(label: string) {
  return screen.getByText(label).closest('div') as HTMLElement
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 14, 12) })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('loads the current month by default', async () => {
    const calls = renderDashboard(() => DATA)
    await screen.findByText('Loading dashboard…')
    await screen.findByText('Income')
    expect(calls).toHaveLength(1)
    expect(calls[0].get('from')).toBe('2026-10-01')
    expect(calls[0].get('to')).toBe('2026-10-31')
  })

  it('shows the four KPI cards with the API values', async () => {
    renderDashboard(() => DATA)
    await screen.findByText('Income')
    expect(within(kpi('Income')).getByText('$3,000.00')).toBeInTheDocument()
    expect(within(kpi('Expenses')).getByText('$750.00')).toBeInTheDocument()
    expect(within(kpi('Savings')).getByText('+$2,250.00')).toHaveClass('text-gain')
    expect(within(kpi('Savings rate')).getByText('75.0%')).toBeInTheDocument()
  })

  it('shows a dash for a null savings rate and negative savings in red', async () => {
    renderDashboard(() => NEGATIVE)
    await screen.findByText('Income')
    expect(within(kpi('Savings rate')).getByText('—')).toBeInTheDocument()
    expect(within(kpi('Savings')).getByText('−$100.00')).toHaveClass('text-loss')
    expect(screen.getByText('No expenses in this period.')).toBeInTheDocument()
  })

  it('sends January 1 through today for the current year', async () => {
    const calls = renderDashboard(() => DATA)
    await screen.findByText('Income')
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'year' } })
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].get('from')).toBe('2026-01-01')
    expect(calls[1].get('to')).toBe('2026-10-14')
  })

  it('sends nothing until a custom range is valid, then refetches', async () => {
    const calls = renderDashboard(() => DATA)
    await screen.findByText('Income')
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-10' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-01' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('From must be on or before To')
    expect(screen.queryByText('Income')).not.toBeInTheDocument()
    expect(calls).toHaveLength(1)

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-31' } })
    await screen.findByText('Income')
    expect(calls).toHaveLength(2)
    expect(calls[1].get('from')).toBe('2026-03-10')
    expect(calls[1].get('to')).toBe('2026-03-31')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error with a retry button', async () => {
    let fail = true
    const calls = renderDashboard(() => (fail ? jsonResponse({ detail: 'boom' }, 500) : DATA))
    await screen.findByText("Couldn't load the dashboard.", {}, { timeout: 4000 })
    fail = false
    const failedCalls = calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Income')
    expect(calls).toHaveLength(failedCalls + 1)
  })

  describe('expense pie', () => {
    it('lists one row per category and drills down to subcategories adding up to the total', async () => {
      renderDashboard(() => DATA)
      const list = await screen.findByRole('list', { name: 'Expenses by category' })
      expect(within(list).getByRole('button', { name: /Food.*\$500\.00/ })).toBeInTheDocument()
      expect(within(list).getByRole('button', { name: /Transport.*\$250\.00/ })).toBeInTheDocument()

      fireEvent.click(within(list).getByRole('button', { name: /Food/ }))
      expect(screen.getByRole('heading', { name: 'Food' })).toBeInTheDocument()
      expect(screen.getByText('Category total:')).toHaveTextContent('$500.00')
      const sub = screen.getByRole('list', { name: 'Food subcategories' })
      const rows = within(sub).getAllByRole('listitem')
      expect(rows.map((row) => row.textContent)).toEqual([
        'Groceries$350.00',
        'Restaurants$100.00',
        '(none)$50.00',
      ])

      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(screen.getByRole('list', { name: 'Expenses by category' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    })

    it('returns to the category view when the period changes', async () => {
      const calls = renderDashboard(() => DATA)
      fireEvent.click(await screen.findByRole('button', { name: /Food/ }))
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'year' } })
      await waitFor(() => expect(calls).toHaveLength(2))
      await screen.findByRole('list', { name: 'Expenses by category' })
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    })
  })
})
