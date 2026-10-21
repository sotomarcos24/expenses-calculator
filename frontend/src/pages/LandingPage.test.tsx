import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

const EMPTY_DASHBOARD = {
  income_total: '0.00',
  expense_total: '0.00',
  savings: '0.00',
  savings_rate: null,
  expenses_by_category: [],
  investments: {
    total_invested: '0.00',
    current_value: '0.00',
    gain: '0.00',
    gain_pct: null,
    by_type: [],
  },
}

describe('landing page routing', () => {
  it('shows the landing to a guest at / without redirecting', async () => {
    mockMe(401)
    const { router } = renderApp('/')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'What it does' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Why trust it' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'How it works' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(5)
  })

  it('shows the dashboard with the app shell to a logged-in user at /', async () => {
    mockMe(200, (path) => {
      if (path.startsWith('/api/dashboard')) return jsonResponse(EMPTY_DASHBOARD)
      throw new Error(`Unexpected request: ${path}`)
    })
    renderApp('/')

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'What it does' }),
    ).not.toBeInTheDocument()
  })

  it('links Log in and Create account to /login and /register', async () => {
    mockMe(401)
    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' })

    for (const link of screen.getAllByRole('link', { name: 'Log in' })) {
      expect(link).toHaveAttribute('href', '/login')
    }
    const create = screen.getAllByRole('link', { name: 'Create account' })
    expect(create.length).toBeGreaterThanOrEqual(2)
    for (const link of create) {
      expect(link).toHaveAttribute('href', '/register')
    }
    const header = screen.getByRole('banner')
    expect(header).toContainElement(screen.getAllByRole('link', { name: 'Log in' })[0])
    expect(header).toContainElement(create[0])
  })

  it('links to the GitHub repository safely from the footer', async () => {
    mockMe(401)
    renderApp('/')
    const footer = await screen.findByRole('contentinfo')
    const link = footer.querySelector('a')!
    expect(link).toHaveAttribute('href', 'https://github.com/sotomarcos24/expenses-calculator')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAccessibleName(/GitHub/)
    expect(footer).toHaveTextContent(/not financial advice/i)
  })

  it.each(['/transactions', '/categories', '/investments', '/simulator'])(
    'sends a guest from %s to /login',
    async (path) => {
      mockMe(401)
      const { router } = renderApp(path)
      expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
    },
  )

  it.each(['/login', '/register'])('the logo on %s links to /', async (path) => {
    mockMe(401)
    renderApp(path)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('link', { name: /PersonalDolar/ })).toHaveAttribute('href', '/')
  })
})
