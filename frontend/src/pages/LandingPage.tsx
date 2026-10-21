import { Link } from 'react-router'
import { Logo } from '../components/Logo.tsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'

const REPO_URL = 'https://github.com/sotomarcos24/expenses-calculator'

const linkButton =
  'whitespace-nowrap inline-flex min-h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors'
const primaryLink = `${linkButton} bg-primary text-primary-foreground hover:bg-primary-hover`
const secondaryLink = `${linkButton} border border-control-border bg-background text-foreground hover:bg-accent`

const FEATURES = [
  {
    title: 'Income and expenses',
    text: 'Record every movement and sort it into categories and subcategories you control.',
  },
  {
    title: 'Gross and net payroll',
    text: 'Enter your gross salary and what lands in your account; the deduction rate is worked out for you.',
  },
  {
    title: 'Investments with gain and loss',
    text: 'Keep your portfolio by hand and see what each position and the total gained or lost, in dollars and percent.',
  },
  {
    title: 'A dashboard that adds it up',
    text: 'Income, expenses, savings and savings rate for any period, with charts you can drill into.',
  },
  {
    title: 'A simulator for what comes next',
    text: 'Project your savings, size a goal or plan retirement withdrawals, with three scenarios and inflation.',
  },
]

const TRUST = [
  'Data entered by hand: you decide what is recorded.',
  'No bank connections and no paid APIs.',
  'Passwords hashed with Argon2.',
  'Your session lives in a secure cookie.',
  'All amounts in USD.',
]

const STEPS = [
  'Create your account.',
  'Record your transactions and investments.',
  'See your dashboard and simulate your future.',
]

/** Decorative chart: three scenario lines that draw themselves (CSS only, see `index.css`). */
function HeroChart() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 320"
      preserveAspectRatio="none"
      className="landing-chart absolute inset-x-0 bottom-0 h-3/5 w-full"
    >
      <path
        className="landing-area fill-accent"
        d="M0 300 C120 280 200 270 300 220 S520 130 640 90 S760 40 800 30 L800 320 L0 320 Z"
      />
      <path
        className="landing-line stroke-scenario-pessimistic"
        pathLength="1"
        d="M0 300 C120 290 220 285 320 260 S540 215 660 190 S760 170 800 160"
        fill="none"
        strokeWidth="3"
        strokeDasharray="1"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="landing-line landing-line-2 stroke-scenario-base"
        pathLength="1"
        d="M0 300 C120 280 200 270 300 220 S520 130 640 90 S760 40 800 30"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        className="landing-line landing-line-3 stroke-scenario-optimistic"
        pathLength="1"
        d="M0 300 C140 270 220 240 320 170 S520 60 660 40 S760 20 800 10"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

const FIGURES = [
  { text: '+$1,250', className: 'left-[8%] top-[80%]', delay: '0s' },
  { text: '$', className: 'left-[30%] top-[88%]', delay: '2.5s' },
  { text: '+4.2%', className: 'left-[62%] top-[70%]', delay: '1.2s' },
  { text: '$', className: 'left-[78%] top-[84%]', delay: '3.6s' },
  { text: '+$320', className: 'left-[86%] top-[62%]', delay: '4.8s' },
]

export function LandingPage() {
  useDocumentTitle('Personal finance tracker')

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full flex-wrap max-w-6xl items-center justify-between gap-3 px-4 py-4 md:px-8">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link to="/login" className={secondaryLink}>
            Log in
          </Link>
          <Link to="/register" className={primaryLink}>
            Create account
          </Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero relative overflow-hidden border-b border-border">
          <HeroChart />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {FIGURES.map((figure) => (
              <span
                key={figure.className}
                className={`landing-figure absolute text-sm font-semibold text-primary md:text-lg ${figure.className}`}
                style={{ animationDelay: figure.delay }}
              >
                {figure.text}
              </span>
            ))}
          </div>
          <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-64 md:px-8 md:pt-20 md:pb-80">
            <h1 className="landing-wordmark font-extrabold text-foreground">
              Personal<span className="text-primary">Dolar</span>
            </h1>
            <p className="mt-6 max-w-xl text-2xl font-semibold text-foreground md:text-3xl">
              Your personal finances, in one clear place
            </p>
            <p className="mt-3 max-w-xl text-base text-muted md:text-lg">
              Track what you earn and spend, follow your investments and see where your savings are
              heading. Everything stays in your hands.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className={primaryLink}>
                Create account
              </Link>
              <Link to="/login" className={secondaryLink}>
                Log in
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="what-it-does" className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <h2 id="what-it-does" className="text-3xl font-bold tracking-tight">
            What it does
          </h2>
          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <article
                key={feature.title}
                className={`bg-background p-6 ${index === FEATURES.length - 1 ? 'lg:col-span-2' : ''}`}
              >
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted">{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="why-trust" className="bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:px-8">
            <h2 id="why-trust" className="text-3xl font-bold tracking-tight">
              Why trust it
            </h2>
            <ul className="space-y-3">
              {TRUST.map((item) => (
                <li key={item} className="flex gap-3 border-b border-border pb-3">
                  <span aria-hidden="true" className="font-bold text-gain">
                    +
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <h2 id="how-it-works" className="text-3xl font-bold tracking-tight">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <span className="pt-1.5 text-lg font-medium">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <Link to="/register" className={primaryLink}>
              Create account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between md:px-8">
          <p>Not financial advice. Projections are estimates, not financial advice.</p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="PersonalDolar on GitHub (repository, opens in a new tab)"
            className="font-medium text-primary underline hover:text-primary-hover"
          >
            GitHub repository
          </a>
        </div>
      </footer>
    </div>
  )
}
