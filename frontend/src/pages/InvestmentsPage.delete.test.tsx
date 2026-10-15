import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentList, InvestmentRead, InvestmentType } from '../api/types.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

type FetchMock = ReturnType<typeof mockMe>

const GENERIC = 'Something went wrong. Please try again.'

/** Decimal string → cents, for the fake API only. */
function cents(value: string) {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

function money(value: bigint) {
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
}

/** Gain fraction with 4 decimals (truncated, enough for the fake), `null` when nothing invested. */
function rate(gain: bigint, invested: bigint) {
  if (invested === 0n) {
    return null
  }
  const scaled = (gain * 10_000n) / invested
  const sign = scaled < 0n ? '-' : ''
  const absolute = scaled < 0n ? -scaled : scaled
  return `${sign}${absolute / 10_000n}.${(absolute % 10_000n).toString().padStart(4, '0')}`
}

type InvestmentFields = {
  name: string
  type: InvestmentType
  platform: string | null
  amount_invested: string
  current_value: string
  value_updated_at: string
}

/** Builds a row the way the API would (normalized money, computed gain). */
function toRead(id: number, fields: InvestmentFields): InvestmentRead {
  const invested = cents(fields.amount_invested)
  const current = cents(fields.current_value)
  return {
    id,
    name: fields.name,
    type: fields.type,
    platform: fields.platform,
    amount_invested: money(invested),
    current_value: money(current),
    value_updated_at: fields.value_updated_at,
    gain: money(current - invested),
    gain_pct: rate(current - invested, invested),
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  }
}

function toList(rows: InvestmentRead[]): InvestmentList {
  const invested = rows.reduce((sum, row) => sum + cents(row.amount_invested), 0n)
  const current = rows.reduce((sum, row) => sum + cents(row.current_value), 0n)
  return {
    items: rows,
    totals: {
      total_invested: money(invested),
      current_value: money(current),
      gain: money(current - invested),
      gain_pct: rate(current - invested, invested),
    },
  }
}

const ETF_WORLD = toRead(7, {
  name: 'ETF World',
  type: 'etf',
  platform: 'Broker X',
  amount_invested: '1000',
  current_value: '1000',
  value_updated_at: '2026-10-01',
})

const BOND = toRead(8, {
  name: 'Bond',
  type: 'deposit',
  platform: null,
  amount_invested: '500',
  current_value: '500',
  value_updated_at: '2026-09-30',
})

type DeleteHandler = (id: number) => Response | Promise<Response>

/**
 * Fake API holding `state.rows`: `DELETE` goes to `onDelete` when given, otherwise it removes the
 * row and answers 204 (404 when it is gone); a value-only `PATCH` updates `current_value`.
 */
async function renderInvestments(initialRows: InvestmentRead[], onDelete?: DeleteHandler) {
  const state = { rows: [...initialRows] }
  const fetchMock = mockMe(200, (path, init) => {
    const method = init.method ?? 'GET'
    if (path === '/api/investments' && method === 'GET') {
      return jsonResponse(toList(state.rows))
    }
    const id = Number(path.split('/').pop())
    const index = state.rows.findIndex((row) => row.id === id)
    if (path.startsWith('/api/investments/') && method === 'DELETE') {
      if (onDelete) {
        return onDelete(id)
      }
      if (index === -1) {
        return jsonResponse({ detail: 'Investment not found' }, 404)
      }
      state.rows = state.rows.filter((row) => row.id !== id)
      return new Response(null, { status: 204 })
    }
    if (path.startsWith('/api/investments/') && method === 'PATCH' && index !== -1) {
      const body = JSON.parse(String(init.body)) as { current_value: string }
      const row = toRead(id, { ...state.rows[index], current_value: body.current_value })
      state.rows[index] = row
      return jsonResponse(row)
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  })
  renderApp('/investments')
  await screen.findByRole('table', { name: 'Investments' })
  return { fetchMock, state }
}

function deleteCalls(fetchMock: FetchMock) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'DELETE')
    .map(([path, init]) => ({
      path: String(path),
      headers: init?.headers as Record<string, string>,
      body: init?.body,
    }))
}

function listCallCount(fetchMock: FetchMock) {
  return fetchMock.mock.calls.filter(
    ([path, init]) => String(path) === '/api/investments' && (init?.method ?? 'GET') === 'GET',
  ).length
}

/** The header "Add investment" button. */
function addButton() {
  return screen.getAllByRole('button', { name: 'Add investment' })[0]
}

function deleteButton(name: string) {
  return screen.getByRole('button', { name: `Delete ${name}` })
}

/** Focuses and clicks the row's Delete button (as a user would), returns it and the dialog. */
async function openDelete(name: string) {
  const trigger = deleteButton(name)
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete investment?' })
  return { trigger, dialog }
}

function confirm(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
}

function rowNames() {
  const table = screen.getByRole('table', { name: 'Investments' })
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent)
}

function totalsValue(term: string) {
  const card = screen.getByRole('region', { name: 'Portfolio totals' })
  return within(card).getByText(term).nextElementSibling as HTMLElement
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Delete button and dialog', () => {
  it('adds a Delete button named after its row, last in the Actions column', async () => {
    await renderInvestments([BOND, ETF_WORLD])
    expect(deleteButton('ETF World')).toHaveTextContent('Delete')
    expect(deleteButton('Bond')).toBeInTheDocument()
    const actions = within(deleteButton('ETF World').closest('tr')!).getAllByRole('button')
    expect(actions.map((button) => button.textContent)).toEqual(['Edit', 'Update value', 'Delete'])
    expect(actions.at(-1)).toBe(deleteButton('ETF World'))
  })

  it('opens a labelled confirmation with the summary and Cancel focused', async () => {
    await renderInvestments([BOND, ETF_WORLD])
    const { dialog } = await openDelete('ETF World')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('ETF World · ETF · $1,000.00')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('closes on Cancel without a request and returns focus to the row', async () => {
    const { fetchMock } = await renderInvestments([BOND, ETF_WORLD])
    const { trigger, dialog } = await openDelete('ETF World')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(rowNames()).toEqual(['Bond', 'ETF World'])
    expect(deleteCalls(fetchMock)).toEqual([])
  })

  it('closes on Escape without a request and returns focus to the row', async () => {
    const { fetchMock } = await renderInvestments([BOND, ETF_WORLD])
    const { trigger, dialog } = await openDelete('ETF World')
    fireEvent.keyDown(within(dialog).getByRole('button', { name: 'Cancel' }), { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(deleteCalls(fetchMock)).toEqual([])
  })

  it('cancels when Enter is pressed right after opening, because Cancel has focus', async () => {
    const { fetchMock } = await renderInvestments([BOND, ETF_WORLD])
    const { trigger } = await openDelete('ETF World')
    // jsdom has no default action for keys: like a browser, Enter activates the focused button.
    const focused = document.activeElement as HTMLElement
    fireEvent.keyDown(focused, { key: 'Enter' })
    fireEvent.click(focused)

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(deleteCalls(fetchMock)).toEqual([])
  })
})

describe('Delete investment', () => {
  it('deletes the right row, refetches, updates the totals and shows "Investment deleted."', async () => {
    const { fetchMock } = await renderInvestments([BOND, ETF_WORLD])
    expect(totalsValue('Current value')).toHaveTextContent('$1,500.00')
    const { dialog } = await openDelete('ETF World')
    confirm(dialog)

    expect(await screen.findByText('Investment deleted.')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['Bond'])
    expect(screen.queryByRole('button', { name: 'Delete ETF World' })).not.toBeInTheDocument()
    expect(totalsValue('Total invested')).toHaveTextContent('$500.00')
    expect(totalsValue('Current value')).toHaveTextContent('$500.00')
    expect(addButton()).toHaveFocus()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const calls = deleteCalls(fetchMock)
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/api/investments/7')
    expect(calls[0].headers['Content-Type']).toBe('application/json')
    expect(calls[0].body).toBeUndefined()
  })

  it('shows the empty state after deleting the only investment', async () => {
    await renderInvestments([ETF_WORLD])
    const { dialog } = await openDelete('ETF World')
    confirm(dialog)

    expect(await screen.findByText('No investments yet.')).toBeInTheDocument()
    expect(screen.getByText('Investment deleted.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add investment' })).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Portfolio totals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('disables Delete while the request is pending, so a double click sends one request', async () => {
    let resolve: (response: Response) => void = () => {}
    const { fetchMock } = await renderInvestments(
      [BOND, ETF_WORLD],
      () => new Promise<Response>((done) => (resolve = done)) as unknown as Response,
    )
    const { dialog } = await openDelete('ETF World')
    const remove = within(dialog).getByRole('button', { name: 'Delete' })
    fireEvent.click(remove)
    fireEvent.click(remove)
    await waitFor(() => expect(remove).toBeDisabled())
    fireEvent.click(remove)
    expect(deleteCalls(fetchMock)).toHaveLength(1)

    await act(async () => resolve(new Response(null, { status: 204 })))
    await screen.findByText('Investment deleted.')
    expect(deleteCalls(fetchMock)).toHaveLength(1)
  })

  it('closes on a 404, shows "Investment not found" and refetches', async () => {
    const { fetchMock, state } = await renderInvestments([BOND, ETF_WORLD], () => {
      state.rows = [BOND]
      return jsonResponse({ detail: 'Investment not found' }, 404)
    })
    const before = listCallCount(fetchMock)
    const { dialog } = await openDelete('ETF World')
    confirm(dialog)

    expect(await screen.findByRole('alert')).toHaveTextContent('Investment not found')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(listCallCount(fetchMock)).toBeGreaterThan(before)
    expect(rowNames()).toEqual(['Bond'])
    expect(screen.queryByText('Investment deleted.')).not.toBeInTheDocument()
    expect(addButton()).toHaveFocus()
  })

  it.each([
    ['a 500', () => new Response('oops', { status: 500 })],
    [
      'a network error',
      () => {
        throw new TypeError('Failed to fetch')
      },
    ],
  ])('keeps the dialog open on %s and allows a retry', async (_, failure) => {
    let fail = true
    const { fetchMock, state } = await renderInvestments([BOND, ETF_WORLD], (id) => {
      if (fail) {
        return failure()
      }
      state.rows = state.rows.filter((row) => row.id !== id)
      return new Response(null, { status: 204 })
    })
    const { dialog } = await openDelete('ETF World')
    confirm(dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(GENERIC)
    expect(screen.getByRole('alertdialog', { name: 'Delete investment?' })).toBe(dialog)
    expect(rowNames()).toEqual(['Bond', 'ETF World'])
    expect(screen.queryByText('Investment deleted.')).not.toBeInTheDocument()
    const remove = within(dialog).getByRole('button', { name: 'Delete' })
    expect(remove).toBeEnabled()

    fail = false
    fireEvent.click(remove)
    await screen.findByText('Investment deleted.')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['Bond'])
    expect(deleteCalls(fetchMock).map((call) => call.path)).toEqual([
      '/api/investments/7',
      '/api/investments/7',
    ])
  })
})

describe('page messages', () => {
  it('clears "Value updated." when the delete dialog opens', async () => {
    await renderInvestments([BOND, ETF_WORLD])
    fireEvent.click(screen.getByRole('button', { name: 'Update value of Bond' }))
    const valueDialog = await screen.findByRole('dialog', { name: 'Update value' })
    fireEvent.change(within(valueDialog).getByLabelText('New current value'), {
      target: { value: '600' },
    })
    fireEvent.click(within(valueDialog).getByRole('button', { name: 'Save' }))
    await screen.findByText('Value updated.')

    const { dialog } = await openDelete('ETF World')
    expect(screen.queryByText('Value updated.')).not.toBeInTheDocument()
    confirm(dialog)

    await screen.findByText('Investment deleted.')
    expect(screen.queryByText('Value updated.')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('never shows "Investment deleted." together with "Investment not found"', async () => {
    let missing = true
    const { state } = await renderInvestments([BOND, ETF_WORLD], (id) => {
      if (missing) {
        missing = false
        state.rows = state.rows.filter((row) => row.id !== id)
        return jsonResponse({ detail: 'Investment not found' }, 404)
      }
      state.rows = state.rows.filter((row) => row.id !== id)
      return new Response(null, { status: 204 })
    })
    let { dialog } = await openDelete('ETF World')
    confirm(dialog)
    expect(await screen.findByRole('alert')).toHaveTextContent('Investment not found')

    ;({ dialog } = await openDelete('Bond'))
    expect(screen.queryByText('Investment not found')).not.toBeInTheDocument()
    confirm(dialog)
    await screen.findByText('Investment deleted.')
    expect(screen.queryByText('Investment not found')).not.toBeInTheDocument()
  })
})
