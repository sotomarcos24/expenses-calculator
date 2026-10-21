import { useRef, useState } from 'react'
import { Button } from '../components/Button.tsx'
import { DeleteAccountDialog } from '../components/DeleteAccountDialog.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { useMe } from '../hooks/useAuth.ts'

export function AccountPage() {
  const { data: user } = useMe()
  const [deleting, setDeleting] = useState(false)
  const openerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <PageHeader title="Account" />
      <section aria-labelledby="account-info" className="mb-8">
        <h2 id="account-info" className="mb-2 text-lg font-semibold text-foreground">
          Your account
        </h2>
        <p className="text-sm text-muted">
          Signed in as <span className="font-medium break-all text-foreground">{user?.email}</span>
        </p>
      </section>
      <section aria-labelledby="danger-zone" className="rounded-xl border border-loss p-4 sm:p-6">
        <h2 id="danger-zone" className="mb-2 text-lg font-semibold text-loss">
          Danger zone
        </h2>
        <p className="mb-4 text-sm text-foreground">
          Deleting your account permanently removes your user and all your transactions, categories,
          investments and settings. This cannot be undone.
        </p>
        <Button ref={openerRef} variant="danger" onClick={() => setDeleting(true)}>
          Delete account
        </Button>
      </section>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </>
  )
}
