import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '../components/Logo.tsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.ts'
import { useCountUp, useReveal } from '../hooks/useReveal.ts'

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

/** Fades and slides its content in the first time it scrolls into view (see `useReveal`). */
function Reveal<T extends RevealTag>({
  as,
  index = 0,
  className,
  children,
  ...props
}: {
  as: T
  index?: number
  className?: string
  children: ReactNode
} & HTMLAttributes<HTMLElement>) {
  const ref = useReveal<HTMLElement>()
  const Tag = as as ElementType
  return (
    <Tag
      {...props}
      ref={ref}
      className={`landing-reveal ${className ?? ''}`}
      style={{ '--reveal-delay': `${index * 0.12}s` } as CSSProperties}
    >
      {children}
    </Tag>
  )
}

type RevealTag = 'div' | 'h1' | 'h2' | 'p' | 'li' | 'article'

const STATS = [
  { prefix: '+$', target: 1250, decimals: 0, suffix: '' },
  { prefix: '+', target: 4.2, decimals: 1, suffix: '%' },
  { prefix: '+$', target: 320, decimals: 0, suffix: '' },
]

function formatStat(stat: (typeof STATS)[number], value: number) {
  const number = value.toLocaleString('en-US', {
    minimumFractionDigits: stat.decimals,
    maximumFractionDigits: stat.decimals,
  })
  return `${stat.prefix}${number}${stat.suffix}`
}

/** A decorative figure that counts up from 0 once it is visible; the final text is in `data-final`. */
function Stat({ stat }: { stat: (typeof STATS)[number] }) {
  const [ref, value] = useCountUp<HTMLSpanElement>(stat.target)
  return (
    <span
      ref={ref}
      data-final={formatStat(stat, stat.target)}
      className="text-3xl font-bold tracking-tight text-primary tabular-nums md:text-5xl"
    >
      {formatStat(stat, value)}
    </span>
  )
}

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
        <section className="landing-hero border-b border-border">
          <div className="mx-auto max-w-6xl px-4 pt-12 pb-16 md:px-8 md:pt-20 md:pb-24">
            <Reveal as="h1" className="landing-wordmark font-extrabold text-foreground">
              Personal<span className="text-primary">Dolar</span>
            </Reveal>
            <Reveal
              as="p"
              index={1}
              className="mt-6 max-w-xl text-2xl font-semibold text-foreground md:text-3xl"
            >
              Your personal finances, in one clear place
            </Reveal>
            <Reveal as="p" index={2} className="mt-3 max-w-xl text-base text-muted md:text-lg">
              Track what you earn and spend, follow your investments and see where your savings are
              heading. Everything stays in your hands.
            </Reveal>
            <Reveal as="div" index={3} className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className={primaryLink}>
                Create account
              </Link>
              <Link to="/login" className={secondaryLink}>
                Log in
              </Link>
            </Reveal>
            <Reveal
              as="div"
              index={4}
              aria-hidden="true"
              className="mt-12 flex flex-wrap gap-x-12 gap-y-4 border-t border-border pt-6"
            >
              {STATS.map((stat) => (
                <Stat key={stat.target} stat={stat} />
              ))}
            </Reveal>
          </div>
        </section>

        <section aria-labelledby="what-it-does" className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <Reveal as="h2" id="what-it-does" className="text-3xl font-bold tracking-tight">
            What it does
          </Reveal>
          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <Reveal
                as="article"
                key={feature.title}
                index={index}
                className={`bg-background p-6 ${index === FEATURES.length - 1 ? 'lg:col-span-2' : ''}`}
              >
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted">{feature.text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section aria-labelledby="why-trust" className="bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:px-8">
            <Reveal as="h2" id="why-trust" className="text-3xl font-bold tracking-tight">
              Why trust it
            </Reveal>
            <ul className="space-y-3">
              {TRUST.map((item, index) => (
                <Reveal
                  as="li"
                  key={item}
                  index={index}
                  className="flex gap-3 border-b border-border pb-3"
                >
                  <span aria-hidden="true" className="font-bold text-gain">
                    +
                  </span>
                  <span>{item}</span>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="mx-auto max-w-6xl px-4 py-16 md:px-8">
          <Reveal as="h2" id="how-it-works" className="text-3xl font-bold tracking-tight">
            How it works
          </Reveal>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal as="li" key={step} index={index} className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground"
                >
                  {index + 1}
                </span>
                <span className="pt-1.5 text-lg font-medium">{step}</span>
              </Reveal>
            ))}
          </ol>
          <Reveal as="div" className="mt-10">
            <Link to="/register" className={primaryLink}>
              Create account
            </Link>
          </Reveal>
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
