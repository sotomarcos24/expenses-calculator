import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type {
  AccumulationResponse,
  AccumulationScenarioResult,
  GoalScenarioResult,
  SimulatorDefaults,
  WithdrawalResponse,
  WithdrawalScenarioResult,
} from '../api/types.ts'
import { jsonResponse, mockMe, renderApp } from '../test/renderApp.tsx'

const DEFAULTS: SimulatorDefaults = {
  starting_amount: '10000.00',
  avg_monthly_expenses: '2000.00',
  inflation_rate: '0.02',
  scenarios: { pessimistic: '0.03', base: '0.05', optimistic: '0.07' },
}

function accumulationScenario(final: string, real: string, years: string | null) {
  return {
    points: [
      { year: 0, age: 30, nominal: '10000.00', real: '10000.00', total_contributed: '0.00' },
      { year: 1, age: 31, nominal: final, real, total_contributed: '1200.00' },
    ],
    years_of_expenses_covered: years,
  } satisfies AccumulationScenarioResult
}

function accumulationResponse(years: string | null = '0.55'): AccumulationResponse {
  return {
    pessimistic: accumulationScenario('11000.00', '10784.31', years),
    base: accumulationScenario('16288.95', '13362.50', years),
    optimistic: accumulationScenario('19671.51', '16138.00', years),
  }
}

function goalScenario(over: Partial<GoalScenarioResult> = {}): GoalScenarioResult {
  return {
    required_contribution: '250.00',
    total_contributed: '30000.00',
    already_reached: false,
    nominal_target: '61000.00',
    ...over,
  }
}

function withdrawalScenario(
  over: Partial<WithdrawalScenarioResult> = {},
): WithdrawalScenarioResult {
  return {
    balance_at_retirement_nominal: '500000.00',
    balance_at_retirement_real: '300000.00',
    monthly_income: '1000.00',
    expenses_coverage_pct: '0.5000',
    lasts_until_end: true,
    depletion_age: null,
    series: [
      { age: 65, nominal: '500000.00', real: '300000.00' },
      { age: 66, nominal: '490000.00', real: '290000.00' },
    ],
    ...over,
  }
}

type Calls = { path: string; body: Record<string, unknown> }[]

type Overrides = {
  defaults?: () => Response
  simulate?: (path: string, body: Record<string, unknown>) => Response
}

function renderSimulator(overrides: Overrides = {}) {
  const calls: Calls = []
  mockMe(200, (path, init) => {
    if (path === '/api/simulator/defaults') {
      return overrides.defaults ? overrides.defaults() : jsonResponse(DEFAULTS)
    }
    if (path.startsWith('/api/simulator/')) {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      calls.push({ path, body })
      if (overrides.simulate) {
        return overrides.simulate(path, body)
      }
      if (path.endsWith('accumulation')) {
        return jsonResponse(accumulationResponse())
      }
      if (path.endsWith('goal')) {
        const scenario = goalScenario()
        return jsonResponse({ pessimistic: scenario, base: scenario, optimistic: scenario })
      }
      const scenario = withdrawalScenario()
      return jsonResponse({ pessimistic: scenario, base: scenario, optimistic: scenario })
    }
    throw new Error(`Unexpected request: ${path}`)
  })
  renderApp('/simulator')
  return calls
}

async function ready() {
  await screen.findByRole('tablist', { name: 'Simulation mode' })
}

function field(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement
}

function type(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } })
}

function run() {
  fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }))
}

function tab(name: RegExp) {
  return screen.getByRole('tab', { name })
}

const DISCLAIMER = 'Projections are estimates, not financial advice.'

describe('SimulatorPage', () => {
  it('shows the three tabs and pre-fills the form from the defaults', async () => {
    renderSimulator()
    await ready()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(tab(/^Accumulation — How much will I have\?$/)).toHaveAttribute('aria-selected', 'true')
    expect(field('Starting amount ($)').value).toBe('10000.00')
    expect(field('Average monthly expenses ($)').value).toBe('2000.00')
    expect(field('Inflation (% per year)').value).toBe('2')
    expect(field('Pessimistic return (% per year)').value).toBe('3')
    expect(field('Base return (% per year)').value).toBe('5')
    expect(field('Optimistic return (% per year)').value).toBe('7')
    expect(field('Current age').value).toBe('')
    expect(field('Horizon (years)')).toBeInTheDocument()

    fireEvent.click(tab(/^Goal/))
    expect(field('Target amount ($)')).toBeInTheDocument()
    expect(field('Years to reach it')).toBeInTheDocument()
    expect((field('Target is in today’s dollars') as HTMLInputElement).checked).toBe(true)

    fireEvent.click(tab(/^Withdrawal/))
    expect(field('Retirement age')).toBeInTheDocument()
    expect(field('End age').value).toBe('100')
    expect(field('Withdrawal type')).toBeInTheDocument()
  })

  it('shows the disclaimer on every tab, also before results', async () => {
    renderSimulator()
    expect(await screen.findByText(DISCLAIMER)).toBeInTheDocument()
    await ready()
    for (const name of [/^Accumulation/, /^Goal/, /^Withdrawal/]) {
      fireEvent.click(tab(name))
      expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
    }
  })

  it('keeps the shared values when switching tabs', async () => {
    renderSimulator()
    await ready()
    type('Starting amount ($)', '5000')
    type('Base return (% per year)', '6.5')
    type('Current age', '30')
    fireEvent.click(tab(/^Goal/))
    expect(field('Starting amount ($)').value).toBe('5000')
    expect(field('Base return (% per year)').value).toBe('6.5')
    fireEvent.click(tab(/^Withdrawal/))
    expect(field('Starting amount ($)').value).toBe('5000')
    expect(field('Current age').value).toBe('30')
    fireEvent.click(tab(/^Accumulation/))
    expect(field('Base return (% per year)').value).toBe('6.5')
  })

  it('moves between tabs with the arrow keys', async () => {
    renderSimulator()
    await ready()
    fireEvent.keyDown(tab(/^Accumulation/), { key: 'ArrowRight' })
    expect(tab(/^Goal/)).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tab(/^Goal/), { key: 'End' })
    expect(tab(/^Withdrawal/)).toHaveAttribute('aria-selected', 'true')
  })

  it('runs Mode A: sends decimal strings and shows all three scenarios', async () => {
    const calls = renderSimulator()
    await ready()
    type('Contribution ($)', '0')
    type('Current age', '30')
    type('Horizon (years)', '10')
    run()
    await screen.findByRole('region', { name: 'Accumulation results' })

    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/api/simulator/accumulation')
    expect(calls[0].body).toEqual({
      starting_amount: '10000.00',
      contribution: '0',
      frequency: 'monthly',
      horizon_years: 10,
      scenarios: { pessimistic: '0.03', base: '0.05', optimistic: '0.07' },
      inflation_rate: '0.02',
      current_age: 30,
      avg_monthly_expenses: '2000.00',
    })
    const base = screen.getByRole('article', { name: 'Base scenario' })
    expect(within(base).getByText('$16,288.95')).toBeInTheDocument()
    expect(within(base).getByText('0.6 years')).toBeInTheDocument()
    expect(within(base).getByText('$1,200.00')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Pessimistic scenario' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Optimistic scenario' })).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Chart legend' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Pessimistic', 'Base', 'Optimistic'])
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('toggles nominal / real without a new request', async () => {
    const calls = renderSimulator()
    await ready()
    type('Current age', '30')
    type('Horizon (years)', '10')
    run()
    const base = await screen.findByRole('article', { name: 'Base scenario' })
    expect(within(base).getByText('$16,288.95')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nominal' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: "Today's dollars" }))
    expect(within(base).getByText('$13,362.50')).toBeInTheDocument()
    expect(within(base).queryByText('$16,288.95')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Nominal' }))
    expect(within(base).getByText('$16,288.95')).toBeInTheDocument()
    expect(calls).toHaveLength(1)
  })

  it('shows "—" and the hint when the average monthly expenses are 0', async () => {
    renderSimulator({
      defaults: () => jsonResponse({ ...DEFAULTS, avg_monthly_expenses: '0.00' }),
      simulate: () => jsonResponse(accumulationResponse(null)),
    })
    await ready()
    expect(
      screen.getByText(/Enter your average monthly expenses to see how long/),
    ).toBeInTheDocument()
    type('Current age', '30')
    type('Horizon (years)', '10')
    run()
    const base = await screen.findByRole('article', { name: 'Base scenario' })
    const label = within(base).getByText('Years of expenses covered')
    expect(label.nextElementSibling).toHaveTextContent('—')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    type('Average monthly expenses ($)', '1500')
    expect(screen.queryByText(/Enter your average monthly expenses/)).not.toBeInTheDocument()
  })

  it('runs Mode B with the frequency label and sends target_is_real', async () => {
    const calls = renderSimulator()
    await ready()
    fireEvent.click(tab(/^Goal/))
    type('Target amount ($)', '50000')
    type('Years to reach it', '10')
    type('Contribution frequency', 'weekly')
    fireEvent.click(field('Target is in today’s dollars'))
    run()
    const base = await screen.findByRole('article', { name: 'Base scenario' })
    expect(calls[0].path).toBe('/api/simulator/goal')
    expect(calls[0].body).toEqual({
      starting_amount: '10000.00',
      target_amount: '50000',
      years: 10,
      frequency: 'weekly',
      scenarios: { pessimistic: '0.03', base: '0.05', optimistic: '0.07' },
      inflation_rate: '0.02',
      target_is_real: false,
    })
    expect(within(base).getByText('Required contribution per week')).toBeInTheDocument()
    expect(within(base).getByText('$250.00')).toBeInTheDocument()
    expect(within(base).getByText('$30,000.00')).toBeInTheDocument()
    expect(screen.queryByText(/Already reached/)).not.toBeInTheDocument()
  })

  it('shows $0.00 and the "already reached" message in Mode B', async () => {
    renderSimulator({
      simulate: () => {
        const reached = goalScenario({
          required_contribution: '0.00',
          total_contributed: '0.00',
          already_reached: true,
        })
        return jsonResponse({ pessimistic: reached, base: reached, optimistic: reached })
      },
    })
    await ready()
    fireEvent.click(tab(/^Goal/))
    type('Target amount ($)', '5000')
    type('Years to reach it', '10')
    run()
    const base = await screen.findByRole('article', { name: 'Base scenario' })
    expect(within(base).getByText('Required contribution per month')).toBeInTheDocument()
    expect(within(base).getAllByText('$0.00')).toHaveLength(2)
    expect(
      within(base).getByText('Already reached: your starting amount covers this goal'),
    ).toBeInTheDocument()
  })

  it('runs Mode C: percent withdrawal body, lasts until / runs out at age', async () => {
    const calls = renderSimulator({
      simulate: () =>
        jsonResponse({
          pessimistic: withdrawalScenario({ lasts_until_end: false, depletion_age: 82 }),
          base: withdrawalScenario(),
          optimistic: withdrawalScenario({ expenses_coverage_pct: null }),
        } satisfies WithdrawalResponse),
    })
    await ready()
    fireEvent.click(tab(/^Withdrawal/))
    type('Contribution ($)', '200')
    type('Current age', '35')
    type('Retirement age', '65')
    type('Withdrawal rate (% of the balance per year)', '4')
    run()
    const base = await screen.findByRole('article', { name: 'Base scenario' })
    expect(calls[0].path).toBe('/api/simulator/withdrawal')
    expect(calls[0].body).toMatchObject({
      current_age: 35,
      retirement_age: 65,
      end_age: 100,
      withdrawal_mode: 'percent',
      withdrawal_rate: '0.04',
      monthly_withdrawal: null,
    })
    expect(within(base).getByText('$500,000.00')).toBeInTheDocument()
    expect(within(base).getByText('$1,000.00')).toBeInTheDocument()
    expect(within(base).getByText('50.0%')).toBeInTheDocument()
    expect(within(base).getByText('Lasts until 100')).toBeInTheDocument()
    expect(
      within(screen.getByRole('article', { name: 'Pessimistic scenario' })).getByText(
        'Runs out at age 82',
      ),
    ).toBeInTheDocument()
    const optimistic = screen.getByRole('article', { name: 'Optimistic scenario' })
    expect(within(optimistic).getByText('Expenses covered').nextElementSibling).toHaveTextContent(
      '—',
    )
    fireEvent.click(screen.getByRole('button', { name: "Today's dollars" }))
    expect(within(base).getByText('$300,000.00')).toBeInTheDocument()
  })

  it('sends a fixed monthly withdrawal in Mode C', async () => {
    const calls = renderSimulator()
    await ready()
    fireEvent.click(tab(/^Withdrawal/))
    type('Current age', '35')
    type('Retirement age', '65')
    type('Withdrawal type', 'fixed')
    type("Monthly withdrawal ($, in today's dollars)", '2500')
    run()
    await screen.findByRole('article', { name: 'Base scenario' })
    expect(calls[0].body).toMatchObject({
      withdrawal_mode: 'fixed',
      withdrawal_rate: null,
      monthly_withdrawal: '2500',
    })
  })

  it('rejects out-of-range input client-side, under the field, without a request', async () => {
    const calls = renderSimulator()
    await ready()
    type('Base return (% per year)', '60')
    type('Current age', '30')
    type('Horizon (years)', '61')
    run()
    expect(await screen.findByText('Base return must be between -50 and 50')).toBeInTheDocument()
    expect(screen.getByText('Horizon must be between 1 and 60')).toBeInTheDocument()
    expect(field('Horizon (years)')).toHaveAttribute('aria-invalid', 'true')
    expect(calls).toHaveLength(0)

    type('Horizon (years)', '10')
    await waitFor(() =>
      expect(screen.queryByText('Horizon must be between 1 and 60')).not.toBeInTheDocument(),
    )
  })

  it('requires the current age and rejects a retirement age that is not after it', async () => {
    renderSimulator()
    await ready()
    type('Horizon (years)', '10')
    run()
    expect(await screen.findByText('Current age is required')).toBeInTheDocument()

    fireEvent.click(tab(/^Withdrawal/))
    expect(screen.queryByText('Current age is required')).not.toBeInTheDocument()
    type('Current age', '50')
    type('Retirement age', '50')
    type('Withdrawal rate (% of the balance per year)', '4')
    run()
    expect(
      await screen.findByText('Retirement age must be greater than your current age'),
    ).toBeInTheDocument()
  })

  it('maps a server 422 to the field and keeps the typed values', async () => {
    renderSimulator({
      simulate: () =>
        jsonResponse(
          {
            detail: [
              {
                type: 'less_than_equal',
                loc: ['body', 'scenarios', 'base'],
                msg: 'Input should be less than or equal to 0.5',
              },
            ],
          },
          422,
        ),
    })
    await ready()
    type('Current age', '30')
    type('Horizon (years)', '10')
    run()
    expect(await screen.findByText('Input should be less than or equal to 0.5')).toBeInTheDocument()
    expect(field('Base return (% per year)')).toHaveAttribute('aria-invalid', 'true')
    expect(field('Horizon (years)').value).toBe('10')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a non-field server error in a form-level message', async () => {
    renderSimulator({
      simulate: () =>
        jsonResponse({ detail: [{ type: 'x', loc: ['body'], msg: 'Something is off' }] }, 422),
    })
    await ready()
    type('Current age', '30')
    type('Horizon (years)', '10')
    run()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    )
  })

  it('keeps the form usable when the defaults fail to load', async () => {
    const calls = renderSimulator({ defaults: () => jsonResponse({ detail: 'boom' }, 500) })
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your defaults")
    expect(field('Starting amount ($)').value).toBe('')
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
    type('Starting amount ($)', '10000')
    type('Pessimistic return (% per year)', '3')
    type('Base return (% per year)', '5')
    type('Optimistic return (% per year)', '7')
    type('Inflation (% per year)', '2')
    type('Average monthly expenses ($)', '0')
    type('Current age', '30')
    type('Horizon (years)', '10')
    run()
    await screen.findByRole('article', { name: 'Base scenario' })
    expect(calls).toHaveLength(1)
  })

  it('offers Try again for the defaults and pre-fills the form once the retry succeeds', async () => {
    let fail = true
    renderSimulator({
      defaults: () => (fail ? jsonResponse({ detail: 'boom' }, 500) : jsonResponse(DEFAULTS)),
    })
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your defaults")
    expect(field('Starting amount ($)').value).toBe('')

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(field('Starting amount ($)').value).not.toBe(''))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('shows a loading state while the defaults load', async () => {
    renderSimulator()
    expect(await screen.findByText('Loading your defaults…')).toBeInTheDocument()
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
    await ready()
  })
})
