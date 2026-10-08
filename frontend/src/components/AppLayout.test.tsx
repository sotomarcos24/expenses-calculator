import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { routes } from '../routes.tsx'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

describe('AppLayout', () => {
  it('renders the brand and all main sections', () => {
    renderAt('/')

    expect(screen.getByText('Dolar')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const label of ['Dashboard', 'Transactions', 'Categories', 'Investments', 'Simulator']) {
      expect(nav).toHaveTextContent(label)
    }
  })

  it('marks the current section as active', () => {
    renderAt('/investments')

    expect(screen.getByRole('link', { name: 'Investments' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('heading', { name: 'Investments' })).toBeInTheDocument()
  })
})
