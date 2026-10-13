import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { mockMe, renderApp } from '../test/renderApp.tsx'

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
