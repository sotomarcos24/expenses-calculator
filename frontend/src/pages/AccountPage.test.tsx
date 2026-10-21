import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { jsonResponse, mockFetch, mockMe, renderApp, TEST_USER } from '../test/renderApp.tsx'

const GENERIC = 'Something went wrong. Please try again.'

type Behaviour = 'ok' | 401 | 429 | 500 | 'slow'

/** Logged in until the delete succeeds; the landing needs no other request. */
function mockAccount(behaviour: Behaviour) {
  let deleted = false
  let release: (() => void) | undefined
  const fetchMock = mockFetch(async (path, init) => {
    if (path === '/api/auth/me' && init.method === undefined) {
      return deleted ? jsonResponse({ detail: 'Not authenticated' }, 401) : jsonResponse(TEST_USER)
    }
    if (path === '/api/auth/me' && init.method === 'DELETE') {
      if (behaviour === 'slow') {
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
      if (behaviour === 'ok' || behaviour === 'slow') {
        deleted = true
        return new Response(null, { status: 204 })
      }
      return jsonResponse({ detail: 'x' }, behaviour)
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  return { fetchMock, release: () => release?.() }
}

function deleteCalls(fetchMock: ReturnType<typeof mockAccount>['fetchMock']) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')
}

async function openDialog() {
  const opener = await screen.findByRole('button', { name: 'Delete account' })
  opener.focus()
  fireEvent.click(opener)
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete account?' })
  return { opener, dialog }
}

describe('Account page', () => {
  it('shows the email and the danger zone, and the nav links to it', async () => {
    mockMe(200)
    renderApp('/account')

    expect(await screen.findByRole('heading', { level: 1, name: 'Account' })).toBeInTheDocument()
    expect(screen.getAllByText(TEST_USER.email).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 2, name: 'Danger zone' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    expect(within(nav).getByRole('link', { name: 'Account' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('redirects a guest to /login', async () => {
    mockMe(401)
    const { router } = renderApp('/account')

    await screen.findByRole('heading', { name: 'Log in' })
    expect(router.state.location.pathname).toBe('/login')
  })

  it('opens an alertdialog with the warning and a labelled password field', async () => {
    mockAccount('ok')
    renderApp('/account')

    const { dialog } = await openDialog()

    expect(within(dialog).getByText(/irreversible/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/transactions, categories, investments/)).toBeInTheDocument()
    const field = within(dialog).getByLabelText('Password')
    expect(field).toHaveAttribute('type', 'password')
    expect(field).toHaveAttribute('autocomplete', 'current-password')
    expect(field).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Delete account' })).toBeDisabled()
  })

  it('Cancel and Escape close without a request and return focus', async () => {
    const { fetchMock } = mockAccount('ok')
    renderApp('/account')

    const { opener, dialog } = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()

    const second = await openDialog()
    fireEvent.keyDown(second.dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(opener).toHaveFocus()
    expect(deleteCalls(fetchMock)).toHaveLength(0)
  })

  it('deletes: one DELETE with the password, lands on the landing with a toast, never /login', async () => {
    const { fetchMock } = mockAccount('ok')
    const { router } = renderApp('/account')
    const visited: string[] = []
    router.subscribe((state) => visited.push(state.location.pathname))

    const { dialog } = await openDialog()
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText('Your account has been deleted.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(visited).not.toContain('/login')
    const calls = deleteCalls(fetchMock)
    expect(calls).toHaveLength(1)
    const [path, init] = calls[0]
    expect(path).toBe('/api/auth/me')
    expect(JSON.parse(String(init?.body))).toEqual({ password: 'secret123' })
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
  })

  it('submits with Enter in the field', async () => {
    const { fetchMock } = mockAccount('ok')
    renderApp('/account')

    const { dialog } = await openDialog()
    const field = within(dialog).getByLabelText('Password')
    fireEvent.change(field, { target: { value: 'secret123' } })
    fireEvent.submit(field.closest('form')!)

    await screen.findByText('Your account has been deleted.')
    expect(deleteCalls(fetchMock)).toHaveLength(1)
  })

  it('wrong password: error in the dialog, value kept, still logged in on /account', async () => {
    mockAccount(401)
    const { router, queryClient } = renderApp('/account')

    const { dialog } = await openDialog()
    const field = within(dialog).getByLabelText('Password')
    fireEvent.change(field, { target: { value: 'nope' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Incorrect password.')
    expect(field).toHaveValue('nope')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/account')
    expect(queryClient.getQueryData(['me'])).toEqual(TEST_USER)

    fireEvent.change(field, { target: { value: 'nope2' } })
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('429 shows the try again later message', async () => {
    mockAccount(429)
    renderApp('/account')

    const { dialog } = await openDialog()
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Too many attempts. Try again later.',
    )
  })

  it('other errors show a generic message and stay logged in', async () => {
    mockAccount(500)
    const { router } = renderApp('/account')

    const { dialog } = await openDialog()
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(GENERIC)
    expect(router.state.location.pathname).toBe('/account')
  })

  it('a double click sends a single request and disables the button while pending', async () => {
    const { fetchMock, release } = mockAccount('slow')
    renderApp('/account')

    const { dialog } = await openDialog()
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'x' } })
    const confirm = within(dialog).getByRole('button', { name: 'Delete account' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(deleteCalls(fetchMock)).toHaveLength(1))
    expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled()
    release()
    await screen.findByText('Your account has been deleted.')
    expect(deleteCalls(fetchMock)).toHaveLength(1)
  })
})
