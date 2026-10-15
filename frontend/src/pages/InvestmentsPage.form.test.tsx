import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentList, InvestmentRead, InvestmentType } from '../api/types.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

type FetchMock = ReturnType<typeof mockMe>

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
    ...fields,
    amount_invested: money(invested),
    current_value: money(current),
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
  current_value: '1150',
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
 * Fake API holding `state.rows`: `POST` adds a row, `PATCH` merges the body into its row (404 when
 * it is gone). `mutate` can answer a mutation instead (return `undefined` to use the default).
 */
async function renderInvestments(initialRows: InvestmentRead[] = [], mutate?: MutationHandler) {
  const state = { rows: [...initialRows], nextId: 100 }
  const fetchMock = mockMe(200, (path, init) => {
    const method = init.method ?? 'GET'
    if (path === '/api/investments' && method === 'GET') {
      return jsonResponse(toList(state.rows))
    }
    if (path.startsWith('/api/investments') && method !== 'GET') {
      const body = JSON.parse(String(init.body)) as InvestmentFields
      const custom = mutate?.(body, path)
      if (custom) {
        return custom
      }
      if (method === 'POST') {
        const row = toRead(state.nextId++, body)
        state.rows.push(row)
        return jsonResponse(row, 201)
      }
      const id = Number(path.split('/').pop())
      const index = state.rows.findIndex((row) => row.id === id)
      if (index === -1) {
        return jsonResponse({ detail: 'Investment not found' }, 404)
      }
      const row = toRead(id, { ...state.rows[index], ...body })
      state.rows[index] = row
      return jsonResponse(row)
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  })
  renderApp('/investments')
  await screen.findByRole('heading', { name: 'Investments' })
  return { fetchMock, state }
}

function mutationCalls(fetchMock: FetchMock) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST' || init?.method === 'PATCH')
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

/** The header "Add investment" button (always the first one). */
function addButton() {
  return screen.getAllByRole('button', { name: 'Add investment' })[0]
}

async function openAdd() {
  fireEvent.click(addButton())
  return screen.findByRole('dialog', { name: 'Add investment' })
}

async function openEdit(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }))
  return screen.findByRole('dialog', { name: 'Edit investment' })
}

function field(dialog: HTMLElement, label: string) {
  return within(dialog).getByLabelText(label)
}

function type(dialog: HTMLElement, label: string, value: string) {
  fireEvent.change(field(dialog, label), { target: { value } })
}

function pickType(dialog: HTMLElement, optionName: string) {
  const select = field(dialog, 'Type')
  const option = within(select).getByRole('option', { name: optionName }) as HTMLOptionElement
  fireEvent.change(select, { target: { value: option.value } })
}

function save(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
}

function fillEtfWorld(dialog: HTMLElement, platform = 'Broker X') {
  type(dialog, 'Name', 'ETF World')
  pickType(dialog, 'ETF')
  type(dialog, 'Platform', platform)
  type(dialog, 'Amount invested', '1000')
  type(dialog, 'Current value', '1150')
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
  vi.setSystemTime(new Date(2026, 9, 14, 23, 30, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Add investment', () => {
  it('is offered in the header and in the empty state, and opens an empty form', async () => {
    await renderInvestments()
    await screen.findByText('No investments yet.')
    const buttons = screen.getAllByRole('button', { name: 'Add investment' })
    expect(buttons).toHaveLength(2)

    for (const button of buttons) {
      fireEvent.click(button)
      const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
      expect(field(dialog, 'Name')).toHaveFocus()
      expect(field(dialog, 'Name')).toHaveValue('')
      const select = field(dialog, 'Type')
      expect(select).toHaveValue('')
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        'Select a type',
        'Stock',
        'Fund',
        'ETF',
        'Crypto',
        'Deposit',
        'Real estate',
        'Other',
      ])
      expect(field(dialog, 'Platform')).toHaveValue('')
      expect(field(dialog, 'Amount invested')).toHaveAttribute('inputmode', 'decimal')
      expect(field(dialog, 'Current value')).toHaveAttribute('inputmode', 'decimal')
      expect(field(dialog, 'Last update')).toHaveAttribute('type', 'date')
      expect(field(dialog, 'Last update')).toHaveValue('2026-10-14')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  })

  it('is available while the list is loading', async () => {
    mockMe(200, () => new Promise<Response>(() => {}))
    renderApp('/investments')
    await screen.findByText('Loading investments…')
    fireEvent.click(screen.getByRole('button', { name: 'Add investment' }))
    expect(await screen.findByRole('dialog', { name: 'Add investment' })).toBeInTheDocument()
  })

  it('sends the exact body, closes, and shows the row and the totals', async () => {
    const { fetchMock } = await renderInvestments()
    await screen.findByText('No investments yet.')
    const dialog = await openAdd()
    fillEtfWorld(dialog)
    save(dialog)

    const status = await screen.findByText('Investment saved.')
    expect(status.parentElement).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutationCalls(fetchMock)).toEqual([
      {
        method: 'POST',
        path: '/api/investments',
        body: {
          name: 'ETF World',
          type: 'etf',
          platform: 'Broker X',
          amount_invested: '1000',
          current_value: '1150',
          value_updated_at: '2026-10-14',
        },
      },
    ])
    await screen.findByRole('table', { name: 'Investments' })
    const row = rowOf('ETF World')
    expect(row.type).toHaveTextContent('ETF')
    expect(row.platform).toHaveTextContent('Broker X')
    expect(row.invested).toHaveTextContent('$1,000.00')
    expect(row.current).toHaveTextContent('$1,150.00')
    expect(within(row.gainLoss).getByText('+$150.00')).toHaveClass('text-gain')
    expect(within(row.gainLoss).getByText('+15.0%')).toHaveClass('text-gain')
    expect(totalsValue('Total invested')).toHaveTextContent('$1,000.00')
    expect(totalsValue('Current value')).toHaveTextContent('$1,150.00')
    expect(within(totalsValue('Gain/loss')).getByText('+$150.00')).toBeInTheDocument()
    expect(within(totalsValue('Gain/loss')).getByText('+15.0%')).toBeInTheDocument()
  })

  it('trims the values and sends an empty platform as null', async () => {
    const { fetchMock } = await renderInvestments()
    const dialog = await openAdd()
    fillEtfWorld(dialog, '   ')
    type(dialog, 'Name', '  ETF World  ')
    type(dialog, 'Amount invested', ' 1000 ')
    save(dialog)

    await screen.findByText('Investment saved.')
    expect(mutationCalls(fetchMock)[0].body).toEqual({
      name: 'ETF World',
      type: 'etf',
      platform: null,
      amount_invested: '1000',
      current_value: '1150',
      value_updated_at: '2026-10-14',
    })
    await screen.findByRole('table', { name: 'Investments' })
    expect(rowOf('ETF World').platform).toHaveTextContent('—')
  })

  it('accepts 0 invested and shows a dash as the percentage', async () => {
    const { fetchMock } = await renderInvestments()
    const dialog = await openAdd()
    type(dialog, 'Name', 'Airdrop')
    pickType(dialog, 'Crypto')
    type(dialog, 'Amount invested', '0')
    type(dialog, 'Current value', '50')
    save(dialog)

    await screen.findByText('Investment saved.')
    expect(mutationCalls(fetchMock)).toHaveLength(1)
    await screen.findByRole('table', { name: 'Investments' })
    const row = rowOf('Airdrop')
    expect(within(row.gainLoss).getByText('+$50.00')).toBeInTheDocument()
    expect(within(row.gainLoss).getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('accepts the largest amount and a future date', async () => {
    const { fetchMock } = await renderInvestments()
    const dialog = await openAdd()
    fillEtfWorld(dialog)
    type(dialog, 'Current value', '999999999999.99')
    type(dialog, 'Last update', '2027-01-31')
    save(dialog)

    await screen.findByText('Investment saved.')
    expect(mutationCalls(fetchMock)[0].body).toMatchObject({
      current_value: '999999999999.99',
      value_updated_at: '2027-01-31',
    })
  })
})

describe('Edit investment', () => {
  it('names each Edit button after its row and adds an Actions column', async () => {
    await renderInvestments([ETF_WORLD, BOND])
    const table = await screen.findByRole('table', { name: 'Investments' })
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.at(-1)).toHaveTextContent('Actions')
    expect(screen.getByRole('button', { name: 'Edit ETF World' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Bond' })).toBeInTheDocument()
  })

  it('pre-fills the form, sends every field with PATCH and shows the updated row', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD, BOND])
    const dialog = await openEdit('ETF World')

    expect(field(dialog, 'Name')).toHaveValue('ETF World')
    expect(field(dialog, 'Type')).toHaveValue('etf')
    expect(field(dialog, 'Platform')).toHaveValue('Broker X')
    expect(field(dialog, 'Amount invested')).toHaveValue('1000.00')
    expect(field(dialog, 'Current value')).toHaveValue('1150.00')
    expect(field(dialog, 'Last update')).toHaveValue('2026-10-01')

    type(dialog, 'Name', 'ETF World Acc')
    save(dialog)

    await screen.findByText('Investment saved.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutationCalls(fetchMock)).toEqual([
      {
        method: 'PATCH',
        path: '/api/investments/7',
        body: {
          name: 'ETF World Acc',
          type: 'etf',
          platform: 'Broker X',
          amount_invested: '1000.00',
          current_value: '1150.00',
          value_updated_at: '2026-10-01',
        },
      },
    ])
    expect(await screen.findByRole('button', { name: 'Edit ETF World Acc' })).toBeInTheDocument()
    expect(rowOf('ETF World Acc').invested).toHaveTextContent('$1,000.00')
  })

  it('pre-fills a null platform as empty and can clear a platform', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD, BOND])
    let dialog = await openEdit('Bond')
    expect(field(dialog, 'Platform')).toHaveValue('')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    dialog = await openEdit('ETF World')
    type(dialog, 'Platform', '')
    save(dialog)

    await screen.findByText('Investment saved.')
    expect(mutationCalls(fetchMock)[0].body).toMatchObject({ platform: null })
    await waitFor(() => expect(rowOf('ETF World').platform).toHaveTextContent('—'))
  })
})

describe('validation', () => {
  it.each([
    ['Name', '', 'Name is required'],
    ['Name', '   ', 'Name is required'],
    ['Name', 'a'.repeat(101), 'Name must be at most 100 characters'],
    ['Platform', 'p'.repeat(101), 'Platform must be at most 100 characters'],
    ['Amount invested', '', 'Amount invested is required'],
    ['Current value', '', 'Current value is required'],
    ['Amount invested', '-5', 'Amount invested cannot be negative'],
    ['Current value', '-5', 'Current value cannot be negative'],
    ['Amount invested', '1.234', 'Use at most 2 decimal places'],
    ['Current value', 'abc', 'Enter an amount like 1234.56'],
    ['Current value', '1,000', 'Enter an amount like 1234.56'],
    ['Current value', '1e3', 'Enter an amount like 1234.56'],
    ['Current value', '.5', 'Enter an amount like 1234.56'],
    ['Current value', '1.', 'Enter an amount like 1234.56'],
    ['Amount invested', '1000000000000', 'Amount invested must be at most 999,999,999,999.99'],
    ['Current value', '1000000000000', 'Current value must be at most 999,999,999,999.99'],
    ['Last update', '', 'Last update is required'],
  ])('%s %j shows "%s", sends nothing and clears when corrected', async (label, value, message) => {
    const { fetchMock } = await renderInvestments()
    const dialog = await openAdd()
    fillEtfWorld(dialog)
    type(dialog, label, value)
    save(dialog)

    const input = field(dialog, label)
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'))
    const error = within(dialog).getByText(message)
    expect(input.getAttribute('aria-describedby')).toContain(error.id)
    expect(mutationCalls(fetchMock)).toEqual([])

    const valid: Record<string, string> = {
      Name: 'ETF World',
      Platform: 'Broker X',
      'Amount invested': '1000',
      'Current value': '1150',
      'Last update': '2026-10-14',
    }
    type(dialog, label, valid[label])
    await waitFor(() => expect(within(dialog).queryByText(message)).not.toBeInTheDocument())
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('requires a type and clears the message when one is selected', async () => {
    const { fetchMock } = await renderInvestments()
    const dialog = await openAdd()
    type(dialog, 'Name', 'ETF World')
    type(dialog, 'Amount invested', '1000')
    type(dialog, 'Current value', '1150')
    save(dialog)

    const error = await within(dialog).findByText('Select a type', { selector: 'p' })
    expect(field(dialog, 'Type').getAttribute('aria-describedby')).toBe(error.id)
    expect(field(dialog, 'Type')).toHaveAttribute('aria-invalid', 'true')
    expect(mutationCalls(fetchMock)).toEqual([])

    pickType(dialog, 'Stock')
    await waitFor(() => expect(field(dialog, 'Type')).not.toHaveAttribute('aria-invalid'))
    expect(within(dialog).queryByText('Select a type', { selector: 'p' })).not.toBeInTheDocument()
  })
})

describe('API errors', () => {
  async function failWith(response: () => Response | Promise<Response>) {
    const { fetchMock } = await renderInvestments([], () => response())
    const dialog = await openAdd()
    fillEtfWorld(dialog)
    save(dialog)
    return { fetchMock, dialog }
  }

  function expectValuesKept(dialog: HTMLElement) {
    expect(screen.getByRole('dialog', { name: 'Add investment' })).toBe(dialog)
    expect(field(dialog, 'Name')).toHaveValue('ETF World')
    expect(field(dialog, 'Type')).toHaveValue('etf')
    expect(field(dialog, 'Platform')).toHaveValue('Broker X')
    expect(field(dialog, 'Amount invested')).toHaveValue('1000')
    expect(field(dialog, 'Current value')).toHaveValue('1150')
    expect(field(dialog, 'Last update')).toHaveValue('2026-10-14')
  }

  it('shows a 422 string detail verbatim and keeps the values', async () => {
    const detail = 'The platform must be at most 100 characters'
    const { dialog } = await failWith(() => jsonResponse({ detail }, 422))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(detail)
    expectValuesKept(dialog)
  })

  it('shows a fixed message for a 422 validation list', async () => {
    const { dialog } = await failWith(() =>
      jsonResponse({ detail: [{ loc: ['body', 'name'], msg: 'bad', type: 'x' }] }, 422),
    )
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Some fields are invalid. Please check the form.',
    )
    expectValuesKept(dialog)
  })

  it.each([
    ['a 500', () => new Response('oops', { status: 500 })],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('shows the generic message for %s', async (_, response) => {
    const { dialog } = await failWith(response)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
    expectValuesKept(dialog)
  })

  it('disables Save while the request is pending and sends one request', async () => {
    let resolve: (response: Response) => void = () => {}
    const { fetchMock, dialog } = await failWith(
      () => new Promise<Response>((done) => (resolve = done)),
    )
    const saveButton = within(dialog).getByRole('button', { name: 'Save' })
    await waitFor(() => expect(saveButton).toBeDisabled())
    fireEvent.click(saveButton)
    fireEvent.submit(saveButton.closest('form')!)
    await act(async () => {})
    expect(mutationCalls(fetchMock)).toHaveLength(1)
    await act(async () => resolve(jsonResponse(ETF_WORLD, 201)))
    await screen.findByText('Investment saved.')
    expect(mutationCalls(fetchMock)).toHaveLength(1)
  })
})

describe('Edit of a row deleted elsewhere', () => {
  it('shows "Investment not found", keeps the values, and the row is gone after Cancel', async () => {
    const { fetchMock, state } = await renderInvestments([ETF_WORLD, BOND])
    await screen.findByRole('table', { name: 'Investments' })
    const trigger = screen.getByRole('button', { name: 'Edit ETF World' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Edit investment' })
    state.rows = [BOND]
    const listCallsBefore = listCallCount(fetchMock)
    type(dialog, 'Current value', '1200')
    save(dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Investment not found')
    expect(screen.getByRole('dialog', { name: 'Edit investment' })).toBe(dialog)
    expect(field(dialog, 'Current value')).toHaveValue('1200')
    await waitFor(() => expect(listCallCount(fetchMock)).toBeGreaterThan(listCallsBefore))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Edit ETF World' })).not.toBeInTheDocument(),
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Investment saved.')).not.toBeInTheDocument()
    // The Edit button that opened the dialog is gone: focus falls back to "Add investment".
    expect(addButton()).toHaveFocus()
  })
})

describe('dialog accessibility', () => {
  it('is a labelled modal that moves focus inside and traps Tab', async () => {
    await renderInvestments()
    const dialog = await openAdd()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(field(dialog, 'Name')).toHaveFocus()

    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(field(dialog, 'Name')).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(cancel).toHaveFocus()
  })

  it('closes on Escape without a request and returns focus to the header button', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    await screen.findByRole('table', { name: 'Investments' })
    const trigger = addButton()
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Add investment' })
    type(dialog, 'Name', 'Draft')
    fireEvent.keyDown(field(dialog, 'Name'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(mutationCalls(fetchMock)).toEqual([])
  })

  it('closes on Cancel and returns focus to the Edit button', async () => {
    const { fetchMock } = await renderInvestments([ETF_WORLD])
    const trigger = await screen.findByRole('button', { name: 'Edit ETF World' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Edit investment' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(mutationCalls(fetchMock)).toEqual([])
  })

  it('returns focus to the Edit button after a save', async () => {
    await renderInvestments([ETF_WORLD])
    const trigger = await screen.findByRole('button', { name: 'Edit ETF World' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Edit investment' })
    save(dialog)
    await screen.findByText('Investment saved.')
    expect(screen.getByRole('button', { name: 'Edit ETF World' })).toHaveFocus()
  })

  it('uses only theme colour tokens', async () => {
    await renderInvestments([ETF_WORLD])
    const dialog = await openEdit('ETF World')
    save(dialog)
    type(dialog, 'Name', '')
    const html = document.body.innerHTML
    expect(html).not.toMatch(/(text|bg|border)-(green|red|emerald|rose)-\d/)
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})
