import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, mockMe, renderApp } from './test/renderApp.tsx'

const CATEGORIES = [
  {
    id: 1,
    name: 'Food',
    kind: 'expense',
    parent_id: null,
    subcategories: [{ id: 2, name: 'Groceries', kind: 'expense', parent_id: 1 }],
  },
  { id: 5, name: 'Salary', kind: 'income', parent_id: null, subcategories: [] },
]

const INVESTMENT = {
  id: 1,
  name: 'Index fund',
  type: 'etf',
  platform: null,
  amount_invested: '1000.00',
  current_value: '1150.00',
  gain: '150.00',
  gain_pct: '0.1500',
  value_updated_at: '2026-10-14',
  created_at: '2026-10-14T10:00:00Z',
  updated_at: '2026-10-14T10:00:00Z',
}

const DASHBOARD = {
  income_total: '3000.00',
  expense_total: '750.00',
  savings: '2250.00',
  savings_rate: '0.7500',
  expenses_by_category: [
    {
      category_id: 1,
      name: 'Food',
      total: '500.00',
      subcategories: [{ id: 11, name: 'Groceries', total: '500.00' }],
    },
  ],
  investments: {
    total_invested: '1000.00',
    current_value: '1150.00',
    gain: '150.00',
    gain_pct: '0.1500',
    by_type: [{ type: 'etf', current_value: '1150.00' }],
  },
}

const SCENARIO = {
  points: [
    { year: 0, age: 30, nominal: '10000.00', real: '10000.00', total_contributed: '0.00' },
    { year: 1, age: 31, nominal: '16288.95', real: '13362.50', total_contributed: '1200.00' },
  ],
  years_of_expenses_covered: '0.55',
}

function mockApi() {
  return mockMe(200, (path) => {
    if (path === '/api/category-amounts') {
      return jsonResponse([
        { id: 1, category_id: 1, subcategory_id: 2, amount: '40.00', note: null },
      ])
    }
    if (path.startsWith('/api/categories')) return jsonResponse(CATEGORIES)
    if (path.startsWith('/api/transactions')) return jsonResponse({ items: [], total: 0 })
    if (path.startsWith('/api/investments')) {
      return jsonResponse({
        items: [INVESTMENT],
        totals: {
          total_invested: '1000.00',
          current_value: '1150.00',
          gain: '150.00',
          gain_pct: '0.1500',
        },
      })
    }
    if (path.startsWith('/api/dashboard')) return jsonResponse(DASHBOARD)
    if (path === '/api/simulator/defaults') {
      return jsonResponse({
        starting_amount: '10000.00',
        avg_monthly_expenses: '2000.00',
        inflation_rate: '0.02',
        scenarios: { pessimistic: '0.03', base: '0.05', optimistic: '0.07' },
      })
    }
    if (path === '/api/simulator/accumulation') {
      return jsonResponse({ pessimistic: SCENARIO, base: SCENARIO, optimistic: SCENARIO })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
}

/** Form controls and buttons in `root` that have no accessible name. */
function unnamed(root: HTMLElement): string[] {
  const missing: string[] = []
  const controls = root.querySelectorAll<HTMLElement>('input:not([type=hidden]), select, textarea')
  for (const control of controls) {
    const labelled =
      (control as HTMLInputElement).labels?.length ||
      control.getAttribute('aria-label') ||
      control.getAttribute('aria-labelledby')
    if (!labelled) missing.push(control.outerHTML)
  }
  for (const button of root.querySelectorAll<HTMLElement>('button')) {
    if (!button.textContent?.trim() && !button.getAttribute('aria-label')) {
      missing.push(button.outerHTML)
    }
  }
  return missing
}

const PAGES = [
  ['/', 'Dashboard'],
  ['/transactions', 'Transactions'],
  ['/categories', 'Categories'],
  ['/investments', 'Investments'],
  ['/simulator', 'Simulator'],
] as const

describe('landmarks, headings and titles', () => {
  it.each(PAGES)('%s has one h1, main, nav, banner and its own title', async (path, name) => {
    mockApi()
    renderApp(path)
    expect(await screen.findByRole('heading', { level: 1, name })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(document.title).toBe(`${name} · PersonalDolar`)
  })

  it('the skip link is the first tab stop and moves focus to main', async () => {
    mockApi()
    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    const link = screen.getByRole('link', { name: 'Skip to content' })
    expect(document.body.querySelector('a, button')).toBe(link)
    fireEvent.click(link)
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('login and register have a main landmark, one h1 and a title', async () => {
    mockMe(401)
    renderApp('/login')
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(document.title).toBe('Log in · PersonalDolar')
    expect(unnamed(document.body)).toEqual([])
  })

  it('the landing has one h1, header, main and footer landmarks and a title', async () => {
    mockMe(401)
    renderApp('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(document.title).toBe('Personal finance tracker · PersonalDolar')
    expect(unnamed(document.body)).toEqual([])
  })

  it('register labels every control', async () => {
    mockMe(401)
    renderApp('/register')
    await screen.findByRole('heading', { level: 1, name: 'Create your account' })
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(unnamed(document.body)).toEqual([])
  })
})

describe('every form control has a label', () => {
  it('Transactions: filters (also Custom range) and the Add dialog', async () => {
    mockApi()
    renderApp('/transactions')
    await screen.findByRole('heading', { level: 1, name: 'Transactions' })
    for (const label of ['Period', 'Type', 'Category', 'Subcategory']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    fireEvent.change(screen.getAllByLabelText('Period')[0], { target: { value: 'custom' } })
    expect(screen.getByLabelText('From')).toBeInTheDocument()
    expect(screen.getByLabelText('To')).toBeInTheDocument()
    expect(unnamed(document.body)).toEqual([])

    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' })
    for (const label of ['Date', 'Amount', 'Category', 'Subcategory', 'Note (optional)']) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument()
    }
    expect(within(dialog).getByRole('radio', { name: 'Expense' })).toBeInTheDocument()
    expect(unnamed(dialog)).toEqual([])
  })

  it('Transactions: a validation error is linked with aria-invalid and aria-describedby', async () => {
    mockApi()
    renderApp('/transactions')
    await screen.findByRole('heading', { level: 1, name: 'Transactions' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    const amount = await within(dialog).findByLabelText('Amount')
    await waitFor(() => expect(amount).toHaveAttribute('aria-invalid', 'true'))
    expect(amount).toHaveAccessibleDescription(/Amount/)
  })

  it('Categories: the inline add form', async () => {
    mockApi()
    renderApp('/categories')
    await screen.findByRole('heading', { level: 1, name: 'Categories' })
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add category' }))[0])
    expect(await screen.findByRole('textbox')).toHaveAccessibleName(/name/i)
    expect(unnamed(document.body)).toEqual([])
  })

  it('Categories: the monthly amount buttons and dialog', async () => {
    mockApi()
    renderApp('/categories')
    await screen.findByRole('heading', { level: 1, name: 'Categories' })
    fireEvent.click(await screen.findByRole('button', { name: 'Food' }))
    expect(screen.queryByLabelText('Period')).not.toBeInTheDocument()
    expect(await screen.findAllByText('$40.00 / month')).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: 'Delete monthly amount of Groceries' }),
    ).toBeInTheDocument()
    const add = screen.getByRole('button', { name: 'Add monthly amount to Salary' })
    expect(unnamed(document.body)).toEqual([])
    add.focus()
    fireEvent.click(add)
    const dialog = await screen.findByRole('dialog', { name: 'Monthly amount for Salary' })
    expect(unnamed(dialog)).toEqual([])
    for (const label of ['Amount', 'Note (optional)']) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument()
    }
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(add).toHaveFocus()
  })

  it('Investments: the Add and Update value dialogs and icon-less row buttons', async () => {
    mockApi()
    renderApp('/investments')
    await screen.findByRole('heading', { level: 1, name: 'Investments' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add investment' })[0])
    const add = await screen.findByRole('dialog', { name: 'Add investment' })
    for (const label of ['Name', 'Type', 'Platform', 'Amount invested', 'Current value']) {
      expect(within(add).getByLabelText(new RegExp(label))).toBeInTheDocument()
    }
    expect(within(add).getByLabelText('Last update')).toBeInTheDocument()
    expect(unnamed(add)).toEqual([])
    fireEvent.keyDown(add, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Update value of Index fund' }))
    const value = await screen.findByRole('dialog', { name: 'Update value' })
    expect(within(value).getByLabelText('New current value')).toBeInTheDocument()
    expect(unnamed(document.body)).toEqual([])
  })

  it('Dashboard: the period selector and its custom range', async () => {
    mockApi()
    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'custom' } })
    expect(screen.getByLabelText('From')).toBeInTheDocument()
    expect(screen.getByLabelText('To')).toBeInTheDocument()
    expect(unnamed(document.body)).toEqual([])
  })

  it('Simulator: all three tabs', async () => {
    mockApi()
    renderApp('/simulator')
    await screen.findByRole('tablist', { name: 'Simulation mode' })
    for (const tab of screen.getAllByRole('tab')) {
      fireEvent.click(tab)
      expect(screen.getByRole('tabpanel')).toBeInTheDocument()
      expect(unnamed(document.body)).toEqual([])
    }
  })
})

describe('keyboard', () => {
  it('a dialog takes focus, keeps Tab inside, closes on Escape and returns focus', async () => {
    mockApi()
    renderApp('/transactions')
    await screen.findByRole('heading', { level: 1, name: 'Transactions' })
    const opener = screen.getAllByRole('button', { name: 'Add transaction' })[0]
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    const buttons = within(dialog).getAllByRole('button')
    const last = buttons[buttons.length - 1]
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(document.activeElement).not.toBe(last)

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
  })

  it('simulator tabs follow the arrow keys', async () => {
    mockApi()
    renderApp('/simulator')
    const tabs = await screen.findAllByRole('tab')
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName(tabs[1].textContent ?? '')
  })

  it('the expense pie drills down from a focusable button and back', async () => {
    mockApi()
    renderApp('/')
    const list = await screen.findByRole('list', { name: 'Expenses by category' })
    const food = within(list).getByRole('button', { name: /Food/ })
    food.focus()
    expect(food).toHaveFocus()
    fireEvent.click(food)
    expect(await screen.findByRole('list', { name: 'Food subcategories' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('list', { name: 'Expenses by category' })).toBeInTheDocument()
  })
})

describe('focus after the inline category form', () => {
  it('moves to Add category when the form is cancelled', async () => {
    mockApi()
    renderApp('/categories')
    await screen.findByRole('heading', { level: 1, name: 'Categories' })
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add category' }))[0])
    const input = await screen.findByRole('textbox')
    fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getAllByRole('button', { name: 'Add category' })[0],
      ),
    )
  })
})

describe('charts have text alternatives', () => {
  it('the expense and investment pies list names and amounts', async () => {
    mockApi()
    renderApp('/')
    const expenses = await screen.findByRole('list', { name: 'Expenses by category' })
    expect(expenses).toHaveTextContent('Food')
    expect(expenses).toHaveTextContent('$500.00')
    const investments = screen.getByRole('list', { name: /Investments by type/i })
    expect(investments).toHaveTextContent('$1,150.00')
  })

  it('the pie has no focusable element inside its aria-hidden wrapper', async () => {
    mockApi()
    renderApp('/')
    await screen.findByRole('list', { name: 'Expenses by category' })
    const hidden = document.querySelectorAll('[aria-hidden="true"]')
    const svgs = document.querySelectorAll('.recharts-surface')
    expect(svgs.length).toBeGreaterThan(0)
    for (const el of hidden) {
      expect(el.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0)
    }
  })

  it('the simulator chart has a table with every plotted value', async () => {
    mockApi()
    renderApp('/simulator')
    await screen.findByRole('tablist', { name: 'Simulation mode' })
    fireEvent.change(screen.getByLabelText('Current age'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Horizon (years)'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /run|calculate|simulate/i }))
    const table = await screen.findByRole('table', { name: 'Projected values by year' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Year', 'Pessimistic', 'Base', 'Optimistic'])
    expect(table).toHaveTextContent('$16,288.95')
    for (const el of document.querySelectorAll('[aria-hidden="true"]')) {
      expect(el.querySelectorAll('[tabindex]:not([tabindex="-1"])')).toHaveLength(0)
    }
  })
})
