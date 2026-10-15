import { act } from '@testing-library/react'

/**
 * Controllable `window.matchMedia` for jsdom (which does not implement it). The viewport width
 * starts at `MOBILE_WIDTH` in every test (see `setup.ts`); `resizeTo` changes it and fires
 * `change` on every query whose result flips. Supports `(min-width: …)` and `(max-width: …)` in
 * `px` or `rem` (16px).
 */

export const MOBILE_WIDTH = 375
export const DESKTOP_WIDTH = 1280

type Listener = (event: MediaQueryListEvent) => void

interface Entry {
  query: string
  listeners: Set<Listener>
  matches: boolean
}

let width = MOBILE_WIDTH
let entries: Entry[] = []

function evaluate(query: string, viewport: number) {
  // Not width-based (Recharts asks for it): no user preference in tests.
  if (/^\(\s*prefers-reduced-motion:\s*reduce\s*\)$/.test(query.trim())) {
    return false
  }
  const match = /^\(\s*(min|max)-width:\s*([\d.]+)(px|rem)\s*\)$/.exec(query.trim())
  if (!match) {
    throw new Error(`Unsupported media query in tests: ${query}`)
  }
  const value = Number(match[2]) * (match[3] === 'rem' ? 16 : 1)
  return match[1] === 'min' ? viewport >= value : viewport <= value
}

function matchMedia(query: string): MediaQueryList {
  const entry: Entry = { query, listeners: new Set(), matches: evaluate(query, width) }
  entries.push(entry)
  const add = (type: string, listener: Listener) => {
    if (type === 'change') entry.listeners.add(listener)
  }
  const remove = (type: string, listener: Listener) => {
    if (type === 'change') entry.listeners.delete(listener)
  }
  return {
    media: query,
    get matches() {
      return evaluate(query, width)
    },
    onchange: null,
    addEventListener: add as MediaQueryList['addEventListener'],
    removeEventListener: remove as MediaQueryList['removeEventListener'],
    addListener: (listener: Listener) => entry.listeners.add(listener),
    removeListener: (listener: Listener) => entry.listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList
}

/** Installs the mock with the given viewport width (called before each test by `setup.ts`). */
export function installMatchMedia(initialWidth = MOBILE_WIDTH) {
  width = initialWidth
  entries = []
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })
}

/** Changes the viewport width and fires `change` on the queries whose result flips. */
export function resizeTo(nextWidth: number) {
  act(() => {
    width = nextWidth
    for (const entry of entries) {
      const matches = evaluate(entry.query, width)
      if (matches !== entry.matches) {
        entry.matches = matches
        const event = { matches, media: entry.query } as MediaQueryListEvent
        for (const listener of [...entry.listeners]) listener(event)
      }
    }
  })
}

/** Number of `change` listeners currently registered for `query`, across all its lists. */
export function matchMediaListenerCount(query: string) {
  return entries
    .filter((entry) => entry.query === query)
    .reduce((count, entry) => count + entry.listeners.size, 0)
}
