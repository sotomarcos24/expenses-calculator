import type { MouseEvent } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useLogout, useMe } from '../hooks/useAuth.ts'
import { Logo } from './Logo.tsx'
import { ToastProvider } from './ToastProvider.tsx'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/categories', label: 'Categories' },
  { to: '/investments', label: 'Investments' },
  { to: '/simulator', label: 'Simulator' },
]

function navClass({ isActive }: { isActive: boolean }) {
  const base =
    'inline-flex min-h-10 items-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors'
  return isActive
    ? `${base} bg-primary text-primary-foreground`
    : `${base} text-muted hover:bg-accent hover:text-primary`
}

/** The logged-in user's email and the "Log out" button. */
function UserBox() {
  const { data: user } = useMe()
  const logout = useLogout()
  const email = user?.email ?? ''

  return (
    <div className="flex min-w-0 items-center gap-3 md:order-last md:mt-auto md:flex-col md:items-stretch md:gap-2 md:border-t md:border-border md:px-5 md:py-4">
      <span className="min-w-0 truncate text-sm text-muted" title={email}>
        {email}
      </span>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        Log out
      </button>
    </div>
  )
}

const MAIN_ID = 'main-content'

/** First tab stop: jumps over the navigation to the page content. */
function SkipLink() {
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    document.getElementById(MAIN_ID)?.focus()
  }
  return (
    <a
      href={`#${MAIN_ID}`}
      onClick={skip}
      className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      Skip to content
    </a>
  )
}

export function AppLayout() {
  return (
    <ToastProvider>
      <SkipLink />
      <div className="min-h-dvh md:flex">
        <header className="flex flex-col border-b border-border bg-surface md:min-h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
          {/* Mobile: logo and user on one row. Desktop: `contents` lets the user box move to the
            bottom of the sidebar. */}
          <div className="flex items-center justify-between gap-3 px-4 py-4 md:contents">
            <div className="shrink-0 md:px-5 md:py-6">
              <Logo />
            </div>
            <UserBox />
          </div>
          <nav
            aria-label="Main"
            className="flex gap-1 overflow-x-auto px-4 pb-3 md:flex-col md:px-3 md:pb-0"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main
          id={MAIN_ID}
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8"
        >
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  )
}
