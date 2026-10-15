import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog.tsx'

let failSave: () => void = () => {}

function SavingDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle')
  return (
    <Dialog title="Edit thing" onClose={onClose}>
      <input aria-label="Name" />
      <button
        type="button"
        disabled={state === 'saving'}
        onClick={() => {
          setState('saving')
          failSave = () => setState('error')
        }}
      >
        Save
      </button>
      {state === 'error' && <p role="alert">Could not save.</p>}
    </Dialog>
  )
}

describe('Dialog focus while saving', () => {
  it('keeps focus inside the dialog while the save button is disabled', async () => {
    render(<SavingDialog onClose={() => {}} />)
    screen.getByRole('button', { name: 'Save' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  })

  it('closes on Escape right after an API error, without pressing Tab first', async () => {
    const onClose = vi.fn()
    render(<SavingDialog onClose={onClose} />)
    screen.getByRole('button', { name: 'Save' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    act(() => failSave())
    await screen.findByRole('alert')
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
