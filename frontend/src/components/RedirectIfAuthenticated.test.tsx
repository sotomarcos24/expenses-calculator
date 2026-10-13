import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockFetch, mockMe, renderApp } from '../test/renderApp.tsx'

describe('RedirectIfAuthenticated', () => {
  it.each(['/login', '/register'])('sends a logged-in user from %s to /', async (path) => {
    mockMe(200)
    const { router } = renderApp(path)

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it.each([
    ['/login', 'Log in'],
    ['/register', 'Create your account'],
  ])('renders %s when logged out (no redirect loop)', async (path, heading) => {
    mockMe(401)
    const { router } = renderApp(path)

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(path)
  })

  it('renders the page when /auth/me fails with a non-401 error', async () => {
    mockMe(500)
    renderApp('/login')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
  })

  it('shows the loading indicator while /auth/me is pending', async () => {
    mockFetch(() => new Promise<Response>(() => {}))
    renderApp('/login')

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByRole('heading', { name: 'Log in' })).not.toBeInTheDocument()
  })
})
