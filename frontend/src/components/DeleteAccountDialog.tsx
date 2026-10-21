import { useRef, useState, type FormEvent } from 'react'
import { isUnauthorized, useDeleteAccount } from '../hooks/useAuth.ts'
import { GENERIC_ERROR, isRateLimited, TOO_MANY_ATTEMPTS } from '../lib/authErrors.ts'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'
import { FormError } from './FormError.tsx'
import { TextField } from './TextField.tsx'

export const INCORRECT_PASSWORD = 'Incorrect password.'

type DeleteAccountDialogProps = {
  /** Escape or Cancel: the caller unmounts the dialog. */
  onClose: () => void
}

function errorMessage(error: unknown) {
  if (isUnauthorized(error)) {
    return INCORRECT_PASSWORD
  }
  return isRateLimited(error) ? TOO_MANY_ATTEMPTS : GENERIC_ERROR
}

/**
 * Asks for the password before deleting the account (`alertdialog`). The password field has the
 * initial focus; Enter submits. A wrong password keeps the dialog open and the session alive.
 */
export function DeleteAccountDialog({ onClose }: DeleteAccountDialogProps) {
  const passwordRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const mutation = useDeleteAccount()
  // `isPending` only updates after a render: the ref also blocks a second click in the same tick.
  const sending = useRef(false)

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (password === '' || sending.current || mutation.isPending) {
      return
    }
    sending.current = true
    mutation.mutate(
      { password },
      {
        onSettled: () => {
          sending.current = false
        },
      },
    )
  }

  const edit = (value: string) => {
    setPassword(value)
    if (mutation.isError) {
      mutation.reset()
    }
  }

  return (
    <Dialog
      title="Delete account?"
      role="alertdialog"
      onClose={onClose}
      initialFocusRef={passwordRef}
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-foreground">
          This is irreversible. Your account and all your transactions, categories, investments and
          settings will be permanently deleted. Enter your password to confirm.
        </p>
        <TextField
          ref={passwordRef}
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => edit(event.target.value)}
          maxLength={128}
        />
        <FormError message={mutation.isError ? errorMessage(mutation.error) : undefined} />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="danger" disabled={password === '' || mutation.isPending}>
            {mutation.isPending ? 'Deleting…' : 'Delete account'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
