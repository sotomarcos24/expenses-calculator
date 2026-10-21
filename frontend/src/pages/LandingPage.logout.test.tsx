import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { apiFetch } from '../api/client.ts'
import { ME_QUERY_KEY, SESSION_EXPIRED_KEY } from '../hooks/useAuth.ts'
import { jsonResponse, renderApp, mockFetch, TEST_USER } from '../test/renderApp.tsx'

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

type LogoutBehaviour = 'ok' | 401 | 500

/** Guest: /auth/me 401 until register succeeds; then app data; logout answers `logout`. */
function mockGuestThenApp(logout: LogoutBehaviour) {
  let registered = false
  let loggedOut = false
  return mockFetch((path) => {
    if (path === '/api/auth/me') {
      return registered && !loggedOut
        ? jsonResponse(TEST_USER)
        : jsonResponse({ detail: 'Not authenticated' }, 401)
    }
    if (path === '/api/auth/register') {
      registered = true
      return jsonResponse(TEST_USER, 201)
    }
    if (path === '/api/auth/logout') {
      loggedOut = true
      if (logout === 'ok') return new Response(null, { status: 204 })
      return jsonResponse({ detail: 'x' }, logout)
    }
    // As the real server: once the cookie is cleared every data request is a 401.
    if (loggedOut) return jsonResponse({ detail: 'Not authenticated' }, 401)
    if (path.startsWith('/api/dashboard')) return jsonResponse(EMPTY_DASHBOARD)
    if (path.startsWith('/api/transactions')) {
      return jsonResponse({ items: [], total: 0, page: 1, page_size: 50 })
    }
    if (path.startsWith('/api/categories')) return jsonResponse([])
    throw new Error(`Unexpected request: ${path}`)
  })
}

async function registerFromLanding() {
  fireEvent.click((await screen.findAllByRole('link', { name: 'Create account' }))[0])
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await screen.findByRole('button', { name: 'Log out' })
}

describe('logout from the app lands on the landing page', () => {
  it.each([
    ['/', 'ok'],
    ['/', 401],
    ['/', 500],
    ['/transactions', 'ok'],
    ['/transactions', 401],
    ['/transactions', 500],
  ] as [string, LogoutBehaviour][])(
    'register, then log out from %s (logout answers %s) ends at / with the landing',
    async (from, logout) => {
      mockGuestThenApp(logout)
      const { router, queryClient } = renderApp('/')
      await registerFromLanding()
      const visited: string[] = []
      router.subscribe((state) => visited.push(state.location.pathname))
      if (from !== '/') {
        await router.navigate(from)
        await screen.findByRole('heading', { name: 'Transactions' })
      }

      fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

      expect(
        await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
      ).toBeInTheDocument()
      await waitFor(() => expect(router.state.location.pathname).toBe('/'))
      expect(screen.queryByRole('heading', { name: 'Log in' })).not.toBeInTheDocument()
      // A deliberate logout never passes through /login, not even for a moment.
      expect(visited).not.toContain('/login')
      expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
      expect(queryClient.getQueryData(SESSION_EXPIRED_KEY)).toBeUndefined()
    },
  )
})

describe('a late 401 after a deliberate logout', () => {
  it('does not turn the next visit to / into a redirect to /login', async () => {
    mockGuestThenApp('ok')
    const { router, queryClient } = renderApp('/')
    await registerFromLanding()
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' })

    // An in-flight request of the old session answers 401 after the logout.
    await queryClient
      .fetchQuery({ queryKey: ['dashboard', 'late'], queryFn: () => apiFetch('/dashboard') })
      .catch(() => undefined)

    await router.navigate('/register')
    await screen.findByRole('heading', { name: 'Create your account' })
    fireEvent.click(screen.getByRole('link', { name: /PersonalDolar/ }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})
