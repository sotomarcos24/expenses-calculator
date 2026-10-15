import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, mockMe, renderApp, TEST_USER } from '../test/renderApp.tsx'

type Handler = Parameters<typeof mockMe>[1]

async function renderLogin(handler?: Handler) {
  const fetchMock = mockMe(401, handler)
  const result = renderApp('/login')
  await screen.findByRole('heading', { name: 'Log in' })
  return { ...result, fetchMock }
}

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

function loginCalls(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.filter(([path]) => path === '/api/auth/login')
}

function errorOf(label: string) {
  const input = screen.getByLabelText(label)
  expect(input).toHaveAttribute('aria-invalid', 'true')
  return document.getElementById(input.getAttribute('aria-describedby')!)
}

describe('LoginPage', () => {
  it('renders the labelled fields and the link to /register', async () => {
    await renderLogin()
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/register')
    expect(screen.queryByText(/milestone 2/)).not.toBeInTheDocument()
  })

  it('shows required errors and sends no request when submitted empty', async () => {
    const { fetchMock } = await renderLogin()
    submit()

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(errorOf('Email')).toHaveTextContent('Email is required')
    expect(errorOf('Password')).toHaveTextContent('Password is required')
    expect(loginCalls(fetchMock)).toHaveLength(0)
  })

  it('does not send an over-long password', async () => {
    const { fetchMock } = await renderLogin()
    fill('user@example.com', 'a'.repeat(129))
    submit()

    expect(await screen.findByText('Password must be at most 128 characters')).toBeInTheDocument()
    expect(loginCalls(fetchMock)).toHaveLength(0)
  })

  it('logs in with a trimmed email and lands on /', async () => {
    const { fetchMock, router } = await renderLogin(() => jsonResponse(TEST_USER))
    fill('  user@example.com  ', 'x')
    submit()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.historyAction).toBe('REPLACE')
    const init = loginCalls(fetchMock)[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ email: 'user@example.com', password: 'x' })
  })

  it('shows the "Too many attempts" message on 429 and stays on /login', async () => {
    const { router } = await renderLogin(() =>
      jsonResponse({ detail: 'Too many attempts. Try again later.' }, 429),
    )
    fill('user@example.com', 'x')
    submit()

    expect(await screen.findByText('Too many attempts. Try again later.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('shows "Invalid email or password" on 401, keeps the email and stays on /login', async () => {
    const { router } = await renderLogin(() =>
      jsonResponse({ detail: 'Invalid email or password' }, 401),
    )
    fill('user@example.com', 'wrong-password')
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Email')).toHaveValue('user@example.com')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid')
  })

  it('maps a 422 on body.email to a friendly error under Email', async () => {
    await renderLogin(() =>
      jsonResponse({ detail: [{ loc: ['body', 'email'], msg: 'raw', type: 'x' }] }, 422),
    )
    fill('user@site.local', 'x')
    submit()

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(errorOf('Email')).toHaveTextContent('Enter a valid email address')
  })

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 500', () => new Response('Internal Server Error', { status: 500 })],
  ])('shows the generic error on %s', async (_label, handler) => {
    await renderLogin(handler as Handler)
    fill('user@example.com', 'x')
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
  })

  it('disables the submit button while the request is pending', async () => {
    await renderLogin(() => new Promise<Response>(() => {}))
    fill('user@example.com', 'x')
    submit()

    expect(await screen.findByRole('button', { name: 'Logging in…' })).toBeDisabled()
  })
})
