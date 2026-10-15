import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../hooks/useToast.ts'
import { TOAST_DURATION_MS } from './ToastItem.tsx'
import { ToastProvider } from './ToastProvider.tsx'

function Buttons() {
  const toast = useToast()
  return (
    <>
      <button onClick={() => toast.success('Saved it.')}>ok</button>
      <button onClick={() => toast.error('Broke it.')}>fail</button>
    </>
  )
}

function setup() {
  render(
    <ToastProvider>
      <Buttons />
    </ToastProvider>,
  )
}

describe('Toasts', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows a success toast as a status and an error toast as an alert', () => {
    setup()
    fireEvent.click(screen.getByText('ok'))
    fireEvent.click(screen.getByText('fail'))
    expect(screen.getByRole('status')).toHaveTextContent('Saved it.')
    expect(screen.getByRole('alert')).toHaveTextContent('Broke it.')
  })

  it('dismisses by itself after about 4 seconds', () => {
    setup()
    fireEvent.click(screen.getByText('ok'))
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 100))
    expect(screen.getByText('Saved it.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByText('Saved it.')).not.toBeInTheDocument()
  })

  it('does not restart the timer of an older toast when a new one appears', () => {
    setup()
    fireEvent.click(screen.getByText('ok'))
    act(() => vi.advanceTimersByTime(3000))
    fireEvent.click(screen.getByText('fail'))
    act(() => vi.advanceTimersByTime(1100))
    expect(screen.queryByText('Saved it.')).not.toBeInTheDocument()
    expect(screen.getByText('Broke it.')).toBeInTheDocument()
  })

  it('can be dismissed with its button', () => {
    setup()
    fireEvent.click(screen.getByText('ok'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Saved it.')).not.toBeInTheDocument()
  })

  it('throws a clear error without a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Buttons />)).toThrow('useToast must be used inside a ToastProvider')
  })
})
