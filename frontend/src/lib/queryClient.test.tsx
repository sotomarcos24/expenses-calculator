import { MutationObserver } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { apiFetch } from '../api/client.ts'
import { ME_QUERY_KEY, useLogin, useLogout } from '../hooks/useAuth.ts'
import { jsonResponse, mockFetch, renderApp, TEST_USER } from '../test/renderApp.tsx'

/** A backend where `/api/auth/me` answers with the current `state.me` status. */
function mockBackend() {
  const state = { me: 200 }
  const fetchMock = mockFetch((path) => {
    switch (path) {
      case '/api/auth/me':
        return state.me === 200
          ? jsonResponse(TEST_USER)
          : jsonResponse({ detail: 'Not authenticated' }, state.me)
      case '/api/auth/login':
        return jsonResponse({ detail: 'Invalid email or password' }, 401)
      case '/api/auth/logout':
        state.me = 401
        return new Response(null, { status: 204 })
      case '/api/expired':
        state.me = 401
        return jsonResponse({ detail: 'Not authenticated' }, 401)
      default:
        throw new Error(`Unexpected request: ${path}`)
    }
  })
  return { state, fetchMock }
}

function LoginProbe() {
  const login = useLogin()
  return (
    <button type="button" onClick={() => login.mutate({ email: 'a@b.co', password: 'wrong-pass' })}>
      {login.isError ? 'Login failed' : 'Probe login'}
    </button>
  )
}

function LogoutProbe() {
  const logout = useLogout()
  return (
    <button type="button" onClick={() => logout.mutate()}>
      Probe logout
    </button>
  )
}

describe('global 401 handling', () => {
  it('a 401 from a later query clears the user and ends on /login', async () => {
    mockBackend()
    const { queryClient, router } = renderApp('/')
    await screen.findByRole('heading', { name: 'Dashboard' })

    await queryClient
      .fetchQuery({ queryKey: ['expired'], queryFn: () => apiFetch('/expired'), retry: false })
      .catch(() => {})

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('a 401 from a mutation clears the user and ends on /login', async () => {
    mockBackend()
    const { queryClient, router } = renderApp('/transactions')
    await screen.findByRole('heading', { name: 'Transactions' })

    const observer = new MutationObserver(queryClient, {
      mutationFn: () => apiFetch('/expired', { method: 'POST' }),
    })
    await observer.mutate().catch(() => {})

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('a 401 from the login mutation does not clear the user or navigate', async () => {
    const { fetchMock } = mockBackend()
    const { queryClient, router } = renderApp('/', { probe: <LoginProbe /> })
    await screen.findByRole('heading', { name: 'Dashboard' })

    fireEvent.click(screen.getByRole('button', { name: 'Probe login' }))

    expect(await screen.findByRole('button', { name: 'Login failed' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.anything())
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(TEST_USER)
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})

describe('useLogout', () => {
  it('posts to /auth/logout, ends on / and keeps protected routes locked', async () => {
    const { fetchMock } = mockBackend()
    const { queryClient, router } = renderApp('/', { probe: <LogoutProbe /> })
    await screen.findByRole('heading', { name: 'Dashboard' })
    queryClient.setQueryData(['other-user-data'], { secret: true })

    fireEvent.click(screen.getByRole('button', { name: 'Probe logout' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
    const logoutCall = fetchMock.mock.calls.find(([input]) => input === '/api/auth/logout')
    expect(logoutCall).toBeDefined()
    const init = logoutCall![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(router.state.location.pathname).toBe('/')
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
    expect(queryClient.getQueryData(['other-user-data'])).toBeUndefined()

    await router.navigate('/transactions')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(screen.queryByRole('heading', { name: 'Transactions' })).not.toBeInTheDocument()
  })
})
