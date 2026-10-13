import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, mockFetch, mockMe, renderApp, TEST_USER } from '../test/renderApp.tsx'

describe('RequireAuth', () => {
  it.each([
    ['/', 'Dashboard'],
    ['/transactions', 'Transactions'],
  ])('redirects %s to the login page when logged out', async (path, heading) => {
    mockMe(401)
    const { router } = renderApp(path)

    expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('renders the layout and the page when logged in', async () => {
    mockMe(200)
    renderApp('/')

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows a loading indicator while /auth/me is pending', async () => {
    mockFetch(() => new Promise<Response>(() => {}))
    renderApp('/')

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByRole('heading', { name: 'Log in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })

  it('shows an error with a retry button on a non-401 failure, and recovers', async () => {
    let meStatus = 500
    mockFetch(() =>
      meStatus === 200 ? jsonResponse(TEST_USER) : jsonResponse({ detail: 'boom' }, meStatus),
    )
    const { router } = renderApp('/')

    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(screen.getByRole('alert')).toHaveTextContent('could not load your session')
    expect(screen.queryByRole('heading', { name: 'Log in' })).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')

    meStatus = 200
    fireEvent.click(retry)

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('does not retry /auth/me on 401 (real createQueryClient defaults)', async () => {
    const fetchMock = mockMe(401)
    renderApp('/')

    await screen.findByRole('heading', { name: 'Log in' })
    // Let any pending retry timer (default delay 1s) fire if one had been scheduled.
    await new Promise((resolve) => setTimeout(resolve, 1100))

    const meCalls = fetchMock.mock.calls.filter(([input]) => String(input) === '/api/auth/me')
    expect(meCalls).toHaveLength(1)
  })
})
