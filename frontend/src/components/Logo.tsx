import { Link } from 'react-router'

/** The brand mark; it links to `/` (the landing for guests, the dashboard when logged in). */
export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-lg font-bold text-foreground">
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"
      >
        $
      </span>
      <span>
        Personal<span className="text-primary">Dolar</span>
      </span>
    </Link>
  )
}
