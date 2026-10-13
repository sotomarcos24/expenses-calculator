import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, mockMe, renderApp, TEST_USER } from '../test/renderApp.tsx'

type Handler = Parameters<typeof mockMe>[1]

async function renderRegister(handler?: Handler) {
  const fetchMock = mockMe(401, handler)
  const result = renderApp('/register')
  await screen.findByRole('heading', { name: 'Create your account' })
  return { ...result, fetchMock }
}

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

function registerCalls(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.filter(([path]) => path === '/api/auth/register')
}

function errorOf(label: string) {
  const input = screen.getByLabelText(label)
  expect(input).toHaveAttribute('aria-invalid', 'true')
  const id = input.getAttribute('aria-describedby')
  expect(id).toBeTruthy()
  return document.getElementById(id!)
}

describe('RegisterPage', () => {
  it('renders the labelled fields and the link to /login', async () => {
    await renderRegister()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByText(/milestone 2/)).not.toBeInTheDocument()
  })

  it('shows required errors and sends no request when submitted empty', async () => {
    const { fetchMock } = await renderRegister()
    submit()

    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(errorOf('Email')).toHaveTextContent('Email is required')
    expect(errorOf('Password')).toHaveTextContent('Password is required')
    expect(registerCalls(fetchMock)).toHaveLength(0)
  })

  it('shows an email format error', async () => {
    const { fetchMock } = await renderRegister()
    fill('not-an-email', '12345678')
    submit()

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(errorOf('Email')).toHaveTextContent('Enter a valid email address')
    expect(registerCalls(fetchMock)).toHaveLength(0)
  })

  it('rejects a 7-character password and a 129-character one', async () => {
    const { fetchMock } = await renderRegister()
    fill('user@example.com', '1234567')
    submit()
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(errorOf('Password')).toHaveTextContent('Password must be at least 8 characters')

    fill('user@example.com', 'a'.repeat(129))
    expect(await screen.findByText('Password must be at most 128 characters')).toBeInTheDocument()

    submit()
    expect(registerCalls(fetchMock)).toHaveLength(0)
  })

  it('re-validates on change after a failed submit', async () => {
    await renderRegister()
    fill('user@example.com', '1234567')
    submit()
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()

    fill('user@example.com', '12345678')
    await waitFor(() =>
      expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid'),
    )
    expect(screen.queryByText('Password must be at least 8 characters')).not.toBeInTheDocument()
  })

  it('registers with a trimmed email and an 8-character password, then lands on /', async () => {
    const { fetchMock, router } = await renderRegister(() => jsonResponse(TEST_USER, 201))
    fill('  user@example.com  ', '12345678')
    submit()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.historyAction).toBe('REPLACE')

    const calls = registerCalls(fetchMock)
    expect(calls).toHaveLength(1)
    const init = calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'user@example.com',
      password: '12345678',
    })
  })

  it('shows the duplicate-email message under Email on 409 and stays on /register', async () => {
    const { router } = await renderRegister(() =>
      jsonResponse({ detail: 'An account with this email already exists' }, 409),
    )
    fill('user@example.com', '12345678')
    submit()

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    expect(errorOf('Email')).toHaveTextContent('An account with this email already exists')
    expect(router.state.location.pathname).toBe('/register')
  })

  it('maps a 422 on body.email to a friendly error under Email', async () => {
    await renderRegister(() =>
      jsonResponse(
        {
          detail: [
            { loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'x' },
          ],
        },
        422,
      ),
    )
    fill('user@site.local', '12345678')
    submit()

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(errorOf('Email')).toHaveTextContent('Enter a valid email address')
    expect(screen.queryByText(/value is not a valid email/)).not.toBeInTheDocument()
  })

  it('shows a generic form-level error for a 422 on an unknown location', async () => {
    await renderRegister(() =>
      jsonResponse({ detail: [{ loc: ['body'], msg: 'bad', type: 'x' }] }, 422),
    )
    fill('user@example.com', '12345678')
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
  })

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 500', () => new Response('Internal Server Error', { status: 500 })],
    ['a 415', () => jsonResponse({ detail: 'Unsupported' }, 415)],
  ])('shows the generic error on %s', async (_label, handler) => {
    await renderRegister(handler as Handler)
    fill('user@example.com', '12345678')
    submit()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
  })

  it('disables the submit button while the request is pending', async () => {
    const { fetchMock } = await renderRegister(() => new Promise<Response>(() => {}))
    fill('user@example.com', '12345678')
    submit()

    const button = await screen.findByRole('button', { name: 'Creating account…' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(registerCalls(fetchMock)).toHaveLength(1)
  })

  it('clears the server error on the next submit', async () => {
    let calls = 0
    await renderRegister(() =>
      ++calls === 1 ? jsonResponse({ detail: 'boom' }, 500) : new Promise<Response>(() => {}),
    )
    fill('user@example.com', '12345678')
    submit()
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    submit()
    await screen.findByRole('button', { name: 'Creating account…' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
