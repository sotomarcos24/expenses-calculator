import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PieWithList } from './ExpensePie.tsx'

const slices = [
  { key: 'a', name: 'Food', total: '300.00' },
  { key: 'b', name: 'Rent', total: '200.00' },
  { key: 'c', name: 'Fun', total: '100.00' },
  { key: 'd', name: 'Gym', total: '50.00' },
]

describe('PieWithList colours', () => {
  it('gives each slice a distinct chart token and matches the legend swatches', () => {
    const { container } = render(<PieWithList slices={slices} label="Test pie" />)

    const fills = Array.from(container.querySelectorAll('.recharts-pie-sector path')).map((path) =>
      path.getAttribute('fill'),
    )
    expect(fills).toEqual([1, 2, 3, 4].map((n) => `var(--color-chart-${n})`))
    expect(new Set(fills).size).toBe(4)

    const items = within(screen.getByRole('list', { name: 'Test pie' })).getAllByRole('listitem')
    const swatches = items.map((item) => item.querySelector<HTMLElement>('span[aria-hidden]'))
    expect(swatches.map((swatch) => swatch?.style.backgroundColor)).toEqual(fills)
  })
})
