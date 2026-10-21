import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ME_QUERY_KEY } from '../hooks/useAuth.ts'
import { jsonResponse, mockMe, renderApp, TEST_USER } from '../test/renderApp.tsx'

describe('AppLayout', () => {
  beforeEach(() => {
    mockMe(200)
  })

  it('renders the brand and all main sections', async () => {
    renderApp('/')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(screen.getByText('Dolar')).toBeInTheDocument()
    for (const label of ['Dashboard', 'Transactions', 'Categories', 'Investments', 'Simulator']) {
      expect(nav).toHaveTextContent(label)
    }
  })

  it('marks the current section as active', async () => {
    renderApp('/investments')

    expect(await screen.findByRole('link', { name: 'Investments' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('heading', { name: 'Investments' })).toBeInTheDocument()
  })
})

describe('AppLayout user and logout', () => {
  it("shows the user's email and a Log out button", async () => {
    mockMe(200)
    renderApp('/')

    const email = await screen.findByText(TEST_USER.email)
    expect(email).toHaveAttribute('title', 'ada@example.com')
    expect(email).toHaveClass('truncate')
    expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled()
  })

  it('logs out: posts JSON to /api/auth/logout, ends on / and keeps routes locked', async () => {
    const fetchMock = mockMe(200, (path) => {
      if (path === '/api/auth/logout') {
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { queryClient, router } = renderApp('/')

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
    const logoutCall = fetchMock.mock.calls.find(([input]) => input === '/api/auth/logout')
    expect(logoutCall).toBeDefined()
    const init = logoutCall![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')

    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument()
    await router.navigate('/transactions')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('still logs out client side when the request fails with 500', async () => {
    mockMe(200, (path) => {
      if (path === '/api/auth/logout') {
        return jsonResponse({ detail: 'Internal Server Error' }, 500)
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { queryClient, router } = renderApp('/')

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
  })

  it('still logs out client side on a network error', async () => {
    mockMe(200, (path) => {
      if (path === '/api/auth/logout') {
        return Promise.reject(new TypeError('Failed to fetch'))
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { queryClient, router } = renderApp('/')

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeNull()
  })

  it('disables the Log out button while the request is pending', async () => {
    let resolveLogout: (response: Response) => void = () => {}
    mockMe(200, (path) => {
      if (path === '/api/auth/logout') {
        return new Promise<Response>((resolve) => {
          resolveLogout = resolve
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const { router } = renderApp('/')

    const button = await screen.findByRole('button', { name: 'Log out' })
    fireEvent.click(button)

    await waitFor(() => expect(button).toBeDisabled())
    expect(router.state.location.pathname).toBe('/')

    resolveLogout(new Response(null, { status: 204 }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
  })
})
