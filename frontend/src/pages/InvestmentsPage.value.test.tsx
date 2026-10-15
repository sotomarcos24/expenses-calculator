import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentList, InvestmentRead, InvestmentType } from '../api/types.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

type FetchMock = ReturnType<typeof mockMe>

/** The fake server's "today" (the API sets `value_updated_at` to it on a value-only PATCH). */
const SERVER_TODAY = '2026-10-14'

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

type MutationHandler = (body: unknown, path: string) => Response | Promise<Response> | undefined

/**
 * Fake API holding `state.rows`: `PATCH` merges the body into its row (404 when it is gone) and,
 * like the real API, moves `value_updated_at` to today when `current_value` is sent without it.
 * `mutate` can answer a mutation instead (return `undefined` to use the default).
 */
async function renderInvestments(initialRows: InvestmentRead[], mutate?: MutationHandler) {
  const state = { rows: [...initialRows] }
  const fetchMock = mockMe(200, (path, init) => {
    const method = init.method ?? 'GET'
    if (path === '/api/investments' && method === 'GET') {
      return jsonResponse(toList(state.rows))
    }
    if (path.startsWith('/api/investments/') && method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Partial<InvestmentFields>
      const custom = mutate?.(body, path)
      if (custom) {
        return custom
      }
      const id = Number(path.split('/').pop())
      const index = state.rows.findIndex((row) => row.id === id)
      if (index === -1) {
        return jsonResponse({ detail: 'Investment not found' }, 404)
      }
      const date =
        body.current_value !== undefined && body.value_updated_at === undefined
          ? { value_updated_at: SERVER_TODAY }
          : {}
      const row = toRead(id, { ...state.rows[index], ...body, ...date })
      state.rows[index] = row
      return jsonResponse(row)
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  })
  renderApp('/investments')
  await screen.findByRole('table', { name: 'Investments' })
  return { fetchMock, state }
}

function mutationCalls(fetchMock: FetchMock) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method !== undefined && init.method !== 'GET')
    .map(([path, init]) => ({
      method: init?.method,
      path: String(path),
      body: JSON.parse(String(init?.body)) as unknown,
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

function updateButton(name: string) {
  return screen.getByRole('button', { name: `Update value of ${name}` })
}

/** Focuses and clicks the row's Update value button (as a user would), returns the dialog. */
async function openValue(name: string) {
  const trigger = updateButton(name)
  trigger.focus()
  fireEvent.click(trigger)
  return screen.findByRole('dialog', { name: 'Update value' })
}

function valueField(dialog: HTMLElement) {
  return within(dialog).getByLabelText('New current value')
}

function typeValue(dialog: HTMLElement, value: string) {
  fireEvent.change(valueField(dialog), { target: { value } })
}

function save(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
}

function rowOf(name: string) {
  const table = screen.getByRole('table', { name: 'Investments' })
  const row = within(table)
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(name, { selector: 'td' }))
  if (!row) {
    throw new Error(`No row named ${name}`)
  }
  const [cellName, cellType, platform, invested, current, gainLoss, updated] =
    within(row).getAllByRole('cell')
  return { name: cellName, type: cellType, platform, invested, current, gainLoss, updated }
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

describe('Update value button and dialog', () => {
  it('names each button after its row and opens a pre-filled, focused dialog', async () => {
    await renderInvestments([ETF_WORLD, BOND])
    expect(updateButton('ETF World')).toHaveTextContent('Update value')
    expect(updateButton('Bond')).toBeInTheDocument()
    // After Edit, in the Actions column.
    const actions = within(rowOf('ETF World').name.closest('tr')!).getAllByRole('button')
    expect(actions.map((button) => button.textContent)).toEqual(['Edit', 'Update value'])

    const dialog = await openValue('ETF World')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('ETF World')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Current value: $1,000.00 · Last update: Oct 1, 2026')
    const input = valueField(dialog)
    expect(input).toHaveValue('1000.00')
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).toHaveFocus()
  })
})

describe('saving a new value', () => {
  it('sends only current_value, closes, and shows the updated row and totals', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    const dialog = await openValue('ETF World')
    typeValue(dialog, '1150')
    save(dialog)

    const status = await screen.findByText('Value updated.')
    expect(status).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutationCalls(fetchMock)).toEqual([
      { method: 'PATCH', path: '/api/investments/7', body: { current_value: '1150' } },
    ])
    const row = rowOf('ETF World')
    expect(row.current).toHaveTextContent('$1,150.00')
    expect(within(row.gainLoss).getByText('+$150.00')).toHaveClass('text-gain')
    expect(within(row.gainLoss).getByText('+15.0%')).toHaveClass('text-gain')
    expect(row.updated).toHaveTextContent('Oct 14, 2026')
    expect(totalsValue('Current value')).toHaveTextContent('$1,150.00')
    expect(within(totalsValue('Gain/loss')).getByText('+$150.00')).toBeInTheDocument()
    expect(within(totalsValue('Gain/loss')).getByText('+15.0%')).toBeInTheDocument()
    expect(updateButton('ETF World')).toHaveFocus()
  })

  it('sends the unchanged value too, and the last update moves to today', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    const dialog = await openValue('ETF World')
    save(dialog)

    await screen.findByText('Value updated.')
    expect(mutationCalls(fetchMock)).toEqual([
      { method: 'PATCH', path: '/api/investments/7', body: { current_value: '1000.00' } },
    ])
    expect(rowOf('ETF World').updated).toHaveTextContent('Oct 14, 2026')
  })

  it('trims the typed value', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    const dialog = await openValue('ETF World')
    typeValue(dialog, '  1150.5 ')
    save(dialog)

    await screen.findByText('Value updated.')
    expect(mutationCalls(fetchMock)[0].body).toEqual({ current_value: '1150.5' })
  })

  it('accepts 0 and shows the loss in the loss colour', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    const dialog = await openValue('ETF World')
    typeValue(dialog, '0')
    save(dialog)

    await screen.findByText('Value updated.')
    expect(mutationCalls(fetchMock)[0].body).toEqual({ current_value: '0' })
    const row = rowOf('ETF World')
    expect(row.current).toHaveTextContent('$0.00')
    expect(within(row.gainLoss).getByText('−$1,000.00')).toHaveClass('text-loss')
    expect(within(row.gainLoss).getByText('−100.0%')).toHaveClass('text-loss')
  })

  it('accepts the largest value', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    const dialog = await openValue('ETF World')
    typeValue(dialog, '999999999999.99')
    save(dialog)

    await screen.findByText('Value updated.')
    expect(mutationCalls(fetchMock)[0].body).toEqual({ current_value: '999999999999.99' })
  })
})

describe('validation', () => {
  it.each([
    ['', 'Current value is required'],
    ['   ', 'Current value is required'],
    ['-5', 'Current value cannot be negative'],
    ['1.234', 'Use at most 2 decimal places'],
    ['abc', 'Enter an amount like 1234.56'],
    ['1,000', 'Enter an amount like 1234.56'],
    ['1e3', 'Enter an amount like 1234.56'],
    ['.5', 'Enter an amount like 1234.56'],
    ['1.', 'Enter an amount like 1234.56'],
    ['1000000000000', 'Current value must be at most 999,999,999,999.99'],
  ])('%j shows "%s", sends nothing and clears when corrected', async (value, message) => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    const dialog = await openValue('ETF World')
    typeValue(dialog, value)
    expect(within(dialog).queryByText(message)).not.toBeInTheDocument()
    save(dialog)

    const input = valueField(dialog)
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    const error = within(dialog).getByText(message)
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
    await act(async () => {})
    expect(mutationCalls(fetchMock)).toEqual([])
    expect(screen.getByRole('dialog', { name: 'Update value' })).toBe(dialog)

    typeValue(dialog, '1150')
    await waitFor(() => expect(within(dialog).queryByText(message)).not.toBeInTheDocument())
    expect(input).not.toHaveAttribute('aria-invalid')
  })
})

describe('closing without saving', () => {
  it.each([
    [
      'Cancel',
      (dialog: HTMLElement) =>
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })),
    ],
    ['Escape', (dialog: HTMLElement) => fireEvent.keyDown(valueField(dialog), { key: 'Escape' })],
  ])('%s closes without a request and returns focus to the button', async (_, close) => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    const dialog = await openValue('ETF World')
    typeValue(dialog, '1150')
    close(dialog)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateButton('ETF World')).toHaveFocus()
    expect(mutationCalls(fetchMock)).toEqual([])
    expect(rowOf('ETF World').current).toHaveTextContent('$1,000.00')
  })
})

describe('pending request', () => {
  it('disables Save while pending and sends one request', async () => {
    let resolve: (response: Response) => void = () => {}
    const { fetchMock } = await renderInvestments(
      [ETF_WORLD],
      () => new Promise<Response>((done) => (resolve = done)),
    )
    const dialog = await openValue('ETF World')
    typeValue(dialog, '1150')
    const saveButton = within(dialog).getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)
    await waitFor(() => expect(saveButton).toBeDisabled())
    fireEvent.click(saveButton)
    fireEvent.submit(saveButton.closest('form')!)
    await act(async () => {})
    expect(mutationCalls(fetchMock)).toHaveLength(1)

    await act(async () => resolve(jsonResponse({ ...ETF_WORLD, current_value: '1150.00' })))
    await screen.findByText('Value updated.')
    expect(mutationCalls(fetchMock)).toHaveLength(1)
  })
})

describe('API errors', () => {
  it('a 404 closes the dialog, shows the alert, drops the row and focuses Add investment', async () => {
    const { fetchMock, state } = await renderInvestments([ETF_WORLD, BOND])
    const dialog = await openValue('ETF World')
    state.rows = [BOND]
    const listCallsBefore = listCallCount(fetchMock)
    typeValue(dialog, '1150')
    save(dialog)

    expect(await screen.findByRole('alert')).toHaveTextContent('Investment not found')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(listCallCount(fetchMock)).toBeGreaterThan(listCallsBefore)
    expect(
      screen.queryByRole('button', { name: 'Update value of ETF World' }),
    ).not.toBeInTheDocument()
    expect(addButton()).toHaveFocus()
    expect(screen.queryByText('Value updated.')).not.toBeInTheDocument()
  })

  it.each([
    [
      'a 422 validation list',
      () =>
        jsonResponse({ detail: [{ loc: ['body', 'current_value'], msg: 'x', type: 'x' }] }, 422),
      'Some fields are invalid. Please check the form.',
    ],
    [
      'a 500',
      () => new Response('oops', { status: 500 }),
      'Something went wrong. Please try again.',
    ],
    [
      'a network error',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'Something went wrong. Please try again.',
    ],
  ])('%s stays in the dialog and keeps the value', async (_, response, message) => {
    await renderInvestments([ETF_WORLD], () => response() as Response)
    const dialog = await openValue('ETF World')
    typeValue(dialog, '1150')
    save(dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('dialog', { name: 'Update value' })).toBe(dialog)
    expect(valueField(dialog)).toHaveValue('1150')
    expect(screen.queryByText('Value updated.')).not.toBeInTheDocument()
  })
})

describe('page message', () => {
  it('opening the dialog clears a previous message', async () => {
    await renderInvestments([ETF_WORLD])
    fireEvent.click(screen.getByRole('button', { name: 'Edit ETF World' }))
    const edit = await screen.findByRole('dialog', { name: 'Edit investment' })
    save(edit)
    await screen.findByText('Investment saved.')

    await openValue('ETF World')
    expect(screen.queryByText('Investment saved.')).not.toBeInTheDocument()
  })

  it('uses only theme colour tokens', async () => {
    await renderInvestments([ETF_WORLD])
    const dialog = await openValue('ETF World')
    typeValue(dialog, 'abc')
    save(dialog)
    await within(dialog).findByText('Enter an amount like 1234.56')
    const html = document.body.innerHTML
    expect(html).not.toMatch(/(text|bg|border)-(green|red|emerald|rose)-\d/)
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})
