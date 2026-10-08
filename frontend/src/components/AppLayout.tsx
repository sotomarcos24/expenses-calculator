import { NavLink, Outlet } from 'react-router'
import { Logo } from './Logo.tsx'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/categories', label: 'Categories' },
  { to: '/investments', label: 'Investments' },
  { to: '/simulator', label: 'Simulator' },
]

function navClass({ isActive }: { isActive: boolean }) {
  const base = 'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors'
  return isActive
    ? `${base} bg-primary text-primary-foreground`
    : `${base} text-muted hover:bg-accent hover:text-primary`
}

export function AppLayout() {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-border bg-surface md:min-h-dvh md:w-60 md:border-r md:border-b-0">
        <div className="px-4 py-4 md:px-5 md:py-6">
          <Logo />
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
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
