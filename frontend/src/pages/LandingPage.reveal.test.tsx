import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockMe, renderApp } from '../test/renderApp.tsx'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void

class MockObserver {
  static instances: MockObserver[] = []
  elements = new Set<Element>()
  disconnected = false
  callback: Callback
  constructor(callback: Callback) {
    this.callback = callback
    MockObserver.instances.push(this)
  }
  observe(element: Element) {
    this.elements.add(element)
  }
  disconnect() {
    this.disconnected = true
    this.elements.clear()
  }
  show() {
    act(() => this.callback([{ isIntersecting: true }]))
  }
}

function showAll() {
  for (const observer of [...MockObserver.instances]) {
    if (!observer.disconnected) observer.show()
  }
}

const finals = ['+$1,250', '+4.2%', '+$320']

function figures() {
  return [...document.querySelectorAll<HTMLElement>('[data-final]')]
}

function reducedMotion(reduce: boolean) {
  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    /prefers-reduced-motion:\s*reduce/.test(query)
      ? ({
          matches: reduce,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        } as unknown)
      : original(query)) as typeof window.matchMedia
}

describe('landing without IntersectionObserver (jsdom)', () => {
  it('shows all the content and the final figures, with nothing hidden', async () => {
    mockMe(401)
    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' })

    expect(document.querySelector('[data-reveal]')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'What it does' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(figures().map((figure) => figure.textContent)).toEqual(finals)
  })

  it('has no chart: no .landing-line, .landing-area or svg', async () => {
    mockMe(401)
    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' })
    expect(document.querySelector('.landing-line')).toBeNull()
    expect(document.querySelector('.landing-area')).toBeNull()
    expect(document.querySelector('svg')).toBeNull()
  })
})

describe('landing with IntersectionObserver', () => {
  let frames: FrameRequestCallback[]
  let time: number

  beforeEach(() => {
    MockObserver.instances = []
    frames = []
    time = 0
    vi.stubGlobal('IntersectionObserver', MockObserver)
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function runFrames(at: number) {
    time = at
    const pending = frames
    frames = []
    act(() => pending.forEach((cb) => cb(at)))
  }

  it('hides the sections until they are seen, then shows them once', async () => {
    mockMe(401)
    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' })

    const heading = screen.getByRole('heading', { level: 2, name: 'What it does' })
    expect(heading).toHaveAttribute('data-reveal', 'hidden')
    const articles = screen.getAllByRole('article')
    for (const article of articles) expect(article).toHaveAttribute('data-reveal', 'hidden')
    const delays = articles.map((article) => article.style.getPropertyValue('--reveal-delay'))
    expect(new Set(delays).size).toBe(articles.length)

    showAll()
    expect(heading).toHaveAttribute('data-reveal', 'shown')
    for (const article of articles) expect(article).toHaveAttribute('data-reveal', 'shown')
    expect(MockObserver.instances.every((observer) => observer.disconnected)).toBe(true)
  })

  it('counts the figures up from 0 to exactly their values, once', async () => {
    mockMe(401)
    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' })

    expect(figures().map((figure) => figure.textContent)).toEqual(['+$0', '+0.0%', '+$0'])
    expect(figures().map((figure) => figure.dataset.final)).toEqual(finals)

    showAll()
    runFrames(800)
    const midway = figures().map((figure) => figure.textContent)
    expect(midway).not.toEqual(finals)
    expect(midway).not.toEqual(['+$0', '+0.0%', '+$0'])

    runFrames(1600)
    expect(figures().map((figure) => figure.textContent)).toEqual(finals)
    expect(frames).toHaveLength(0)
  })

  it('with prefers-reduced-motion: reduce shows everything at once, no count-up', async () => {
    reducedMotion(true)
    mockMe(401)
    renderApp('/')
    await screen.findByRole('heading', { level: 1, name: 'PersonalDolar' })

    expect(document.querySelector('[data-reveal]')).toBeNull()
    expect(MockObserver.instances).toHaveLength(0)
    expect(figures().map((figure) => figure.textContent)).toEqual(finals)
    expect(frames).toHaveLength(0)
  })
})
