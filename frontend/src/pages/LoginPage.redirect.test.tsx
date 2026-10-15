import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, mockFetch, renderApp, TEST_USER } from '../test/renderApp.tsx'

/** Logged out until `/api/auth/login` succeeds; other guarded requests answer `other`. */
function mockSession(
  other: (path: string) => Response = () => jsonResponse({ detail: 'unused' }, 500),
) {
  let loggedIn = false
  return mockFetch((path) => {
    if (path === '/api/auth/me') {
      return loggedIn ? jsonResponse(TEST_USER) : jsonResponse({ detail: 'no session' }, 401)
    }
    if (path === '/api/auth/login') {
      loggedIn = true
      return jsonResponse(TEST_USER)
    }
    return other(path)
  })
}

function logIn() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('return to the requested page after login', () => {
  it('goes back to /investments', async () => {
    mockSession((path) =>
      path === '/api/investments'
        ? jsonResponse({
            items: [],
            totals: {
              total_invested: '0',
              current_value: '0',
              gain_loss: '0',
              gain_loss_pct: null,
            },
          })
        : jsonResponse({ detail: 'unused' }, 500),
    )
    const { router } = renderApp('/investments')
    await screen.findByRole('heading', { name: 'Log in' })
    expect(router.state.location.pathname).toBe('/login')

    logIn()

    expect(await screen.findByRole('heading', { name: 'Investments' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/investments')
  })

  it('keeps the query string', async () => {
    mockSession(() => jsonResponse({ items: [], total: 0, page: 1, page_size: 50 }))
    const { router } = renderApp('/transactions?type=expense')
    await screen.findByRole('heading', { name: 'Log in' })

    logIn()

    await screen.findByRole('navigation', { name: 'Main' })
    expect(router.state.location.pathname).toBe('/transactions')
    expect(router.state.location.search).toBe('?type=expense')
  })

  it('lands on / when /login is opened directly', async () => {
    mockSession()
    const { router } = renderApp('/login')
    await screen.findByRole('heading', { name: 'Log in' })

    logIn()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it.each(['/login', '/register', '//evil.com', 'https://evil.com', 'javascript:alert(1)'])(
    'ignores an unsafe state.from (%s)',
    async (from) => {
      mockSession()
      const { router } = renderApp('/login')
      await screen.findByRole('heading', { name: 'Log in' })
      await act(() => router.navigate('/login', { state: { from }, replace: true }))

      logIn()

      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/')
    },
  )

  it('returns to the page after a 401 mid-use', async () => {
    let expired = false
    let loggedIn = true
    mockFetch((path) => {
      if (path === '/api/auth/me') {
        return loggedIn ? jsonResponse(TEST_USER) : jsonResponse({ detail: 'x' }, 401)
      }
      if (path === '/api/auth/login') {
        loggedIn = true
        return jsonResponse(TEST_USER)
      }
      if (path === '/api/investments' && expired) {
        return jsonResponse({ detail: 'expired' }, 401)
      }
      return jsonResponse({
        items: [],
        totals: { total_invested: '0', current_value: '0', gain_loss: '0', gain_loss_pct: null },
      })
    })
    const { router, queryClient } = renderApp('/investments')
    await screen.findByRole('heading', { name: 'Investments' })

    expired = true
    loggedIn = false
    await act(() => queryClient.refetchQueries({ queryKey: ['investments'] }))
    await screen.findByRole('heading', { name: 'Log in' })
    expect(router.state.location.pathname).toBe('/login')

    logIn()

    expect(await screen.findByRole('heading', { name: 'Investments' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/investments')
  })
})
