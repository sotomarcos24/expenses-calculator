import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvestmentList, InvestmentRead, PortfolioTotals } from '../api/types.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

type ListHandler = () => InvestmentList | Response | Promise<Response>

function investment(overrides: Partial<InvestmentRead> & { id: number }): InvestmentRead {
  return {
    name: `Investment ${overrides.id}`,
    type: 'stock',
    platform: 'Broker',
    amount_invested: '1000.00',
    current_value: '1000.00',
    gain: '0.00',
    gain_pct: '0.0000',
    value_updated_at: '2026-10-14',
    created_at: '2026-10-14T10:00:00Z',
    updated_at: '2026-10-14T10:00:00Z',
    ...overrides,
  }
}

const UP = investment({
  id: 1,
  name: 'Index fund',
  type: 'etf',
  amount_invested: '1000.00',
  current_value: '1150.00',
  gain: '150.00',
  gain_pct: '0.1500',
})
const DOWN = investment({
  id: 2,
  name: 'Flat',
  type: 'real_estate',
  platform: null,
  amount_invested: '500.00',
  current_value: '400.00',
  gain: '-100.00',
  gain_pct: '-0.2000',
})
const FREE = investment({
  id: 3,
  name: 'Airdrop',
  type: 'crypto',
  amount_invested: '0.00',
  current_value: '50.00',
  gain: '50.00',
  gain_pct: null,
})

const TOTALS: PortfolioTotals = {
  total_invested: '1500.00',
  current_value: '1600.00',
  gain: '100.00',
  gain_pct: '0.0667',
}

const EMPTY_TOTALS: PortfolioTotals = {
  total_invested: '0.00',
  current_value: '0.00',
  gain: '0.00',
  gain_pct: null,
}

function list(items: InvestmentRead[], totals: PortfolioTotals = TOTALS): InvestmentList {
  return { items, totals }
}

async function renderInvestments(handler: ListHandler) {
  const fetchMock = mockMe(200, (path) => {
    if (path === '/api/investments') {
      const result = handler()
      return result instanceof Response || result instanceof Promise ? result : jsonResponse(result)
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  renderApp('/investments')
  await screen.findByRole('heading', { name: 'Investments' })
  return fetchMock
}

function rows() {
  const table = screen.getByRole('table', { name: 'Investments' })
  return within(table).getAllByRole('row').slice(1)
}

/** Cells of a data row, by column header. */
function cells(row: HTMLElement) {
  const [name, type, platform, invested, current, gainLoss, updated] =
    within(row).getAllByRole('cell')
  return { name, type, platform, invested, current, gainLoss, updated }
}

function totalsCard() {
  return screen.getByRole('region', { name: 'Portfolio totals' })
}

/** The `<dd>` value of a term in the totals card. */
function totalsValue(term: string) {
  const dt = within(totalsCard()).getByText(term)
  return dt.nextElementSibling as HTMLElement
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error')
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('InvestmentsPage', () => {
  it('replaces the placeholder with the header, the totals card and the table', async () => {
    await renderInvestments(() => list([UP, DOWN, FREE]))
    await screen.findByRole('table', { name: 'Investments' })

    expect(screen.getByText('Track what you invested and what it is worth today.')).toBeVisible()
    expect(screen.queryByText(/placeholder|milestone/i)).not.toBeInTheDocument()
    expect(totalsCard()).toBeInTheDocument()
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual([
      'Name',
      'Type',
      'Platform',
      'Invested',
      'Current value',
      'Gain/loss',
      'Last update',
    ])
  })

  it('shows a gain with a plus sign in the gain colour', async () => {
    await renderInvestments(() => list([UP]))
    await screen.findByRole('table')
    const row = cells(rows()[0])

    expect(row.invested).toHaveTextContent('$1,000.00')
    expect(row.current).toHaveTextContent('$1,150.00')
    expect(within(row.gainLoss).getByText('+$150.00')).toHaveClass('text-gain')
    expect(within(row.gainLoss).getByText('+15.0%')).toHaveClass('text-gain')
  })

  it('shows a loss with a minus sign (U+2212) in the loss colour', async () => {
    const loss = investment({
      id: 4,
      amount_invested: '1000.00',
      current_value: '900.00',
      gain: '-100.00',
      gain_pct: '-0.1000',
    })
    await renderInvestments(() => list([loss]))
    await screen.findByRole('table')
    const row = cells(rows()[0])

    expect(within(row.gainLoss).getByText('−$100.00')).toHaveClass('text-loss')
    expect(within(row.gainLoss).getByText('−10.0%')).toHaveClass('text-loss')
    expect(row.gainLoss.textContent).not.toContain('-')
  })

  it('shows a zero gain without sign in normal text colour', async () => {
    const flat = investment({ id: 5, amount_invested: '500.00', current_value: '500.00' })
    await renderInvestments(() => list([flat]))
    await screen.findByRole('table')
    const row = cells(rows()[0])

    for (const text of ['$0.00', '0.0%']) {
      const element = within(row.gainLoss).getByText(text)
      expect(element).toHaveClass('text-foreground')
      expect(element).not.toHaveClass('text-gain')
      expect(element).not.toHaveClass('text-loss')
    }
  })

  it('shows a dash as the percentage when nothing was invested, without errors', async () => {
    await renderInvestments(() => list([FREE]))
    await screen.findByRole('table')
    const row = cells(rows()[0])

    expect(within(row.gainLoss).getByText('+$50.00')).toHaveClass('text-gain')
    const pct = within(row.gainLoss).getByText('—')
    expect(pct).toHaveClass('text-foreground')
    expect(pct).not.toHaveClass('text-gain')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('shows type labels, a dash for a missing platform and the formatted date', async () => {
    await renderInvestments(() => list([UP, DOWN]))
    await screen.findByRole('table')
    const [up, down] = rows().map(cells)

    expect(up.type).toHaveTextContent('ETF')
    expect(up.platform).toHaveTextContent('Broker')
    expect(up.updated).toHaveTextContent('Oct 14, 2026')
    expect(down.type).toHaveTextContent('Real estate')
    expect(down.platform).toHaveTextContent('—')
  })

  it('keeps the order returned by the API', async () => {
    const items = ['alpha', 'Beta', 'gamma'].map((name, index) =>
      investment({ id: 10 - index, name }),
    )
    await renderInvestments(() => list(items))
    await screen.findByRole('table')

    expect(rows().map((row) => cells(row).name.textContent)).toEqual(['alpha', 'Beta', 'gamma'])
  })

  it('shows the portfolio totals from the API', async () => {
    await renderInvestments(() => list([UP, DOWN, FREE]))
    await screen.findByRole('table')

    expect(totalsValue('Total invested')).toHaveTextContent('$1,500.00')
    expect(totalsValue('Current value')).toHaveTextContent('$1,600.00')
    const gainLoss = totalsValue('Gain/loss')
    expect(within(gainLoss).getByText('+$100.00')).toHaveClass('text-gain')
    expect(within(gainLoss).getByText('+6.7%')).toHaveClass('text-gain')
  })

  it('shows a dash as the total percentage when nothing was invested', async () => {
    await renderInvestments(() =>
      list([FREE], {
        total_invested: '0.00',
        current_value: '50.00',
        gain: '50.00',
        gain_pct: null,
      }),
    )
    await screen.findByRole('table')

    const gainLoss = totalsValue('Gain/loss')
    expect(within(gainLoss).getByText('+$50.00')).toHaveClass('text-gain')
    expect(within(gainLoss).getByText('—')).toHaveClass('text-foreground')
  })

  it('shows "No investments yet." without the totals card when there are none', async () => {
    await renderInvestments(() => list([], EMPTY_TOTALS))

    expect(await screen.findByText('No investments yet.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Portfolio totals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the loading text, not the empty message, while the request is pending', async () => {
    await renderInvestments(() => new Promise<Response>(() => {}))

    expect(await screen.findByText('Loading investments…')).toBeInTheDocument()
    expect(screen.queryByText('No investments yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Portfolio totals' })).not.toBeInTheDocument()
  })

  it('shows an alert without table or totals when the request fails, and can retry', async () => {
    let fail = true
    await renderInvestments(() =>
      fail ? new Response('Internal Server Error', { status: 500 }) : list([UP]),
    )

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      "Couldn't load investments.",
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Portfolio totals' })).not.toBeInTheDocument()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('table')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses only theme colour tokens', async () => {
    await renderInvestments(() => list([UP, DOWN, FREE]))
    await screen.findByRole('table')

    const html = document.body.innerHTML
    expect(html).not.toMatch(/(text|bg|border)-(green|red|emerald|rose)-\d/)
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })

  it('scrolls the table inside its own container and stacks the totals on mobile', async () => {
    await renderInvestments(() => list([UP, DOWN, FREE]))
    const table = await screen.findByRole('table')

    expect(table.parentElement).toHaveClass('overflow-x-auto')
    // One column below `sm`: the three totals stack.
    expect(totalsCard().querySelector('dl')).toHaveClass('grid-cols-1', 'sm:grid-cols-3')
  })
})
