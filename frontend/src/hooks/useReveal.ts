import { useEffect, useRef, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * True when scroll animations can run: the browser has `IntersectionObserver` and the user has
 * not asked for reduced motion. Otherwise everything is shown at once in its final state.
 */
export function canAnimate() {
  if (typeof IntersectionObserver === 'undefined') return false
  if (typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches) {
    return false
  }
  return true
}

/**
 * Calls `onVisible` once, the first time `element` enters the viewport, and stops observing.
 * Returns a function that stops observing early.
 */
function observeOnce(element: Element, onVisible: () => void, threshold: number) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        onVisible()
      }
    },
    { threshold },
  )
  observer.observe(element)
  return () => observer.disconnect()
}

/**
 * Scroll reveal for one element. The element is hidden (`data-reveal="hidden"`, styled in
 * `index.css` only for users without a reduced-motion preference) only after `canAnimate()` is
 * confirmed, and becomes `data-reveal="shown"` the first time it enters the viewport. Without
 * support nothing is touched, so the content is always visible.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || !canAnimate()) return
    element.dataset.reveal = 'hidden'
    const stop = observeOnce(
      element,
      () => {
        element.dataset.reveal = 'shown'
      },
      0.15,
    )
    return () => {
      stop()
      delete element.dataset.reveal
    }
  }, [])

  return ref
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * A number that counts up from 0 to `target` (once, `durationMs`, `requestAnimationFrame`) when
 * its element enters the viewport. Without animation support it is `target` from the first
 * render. Returns the element ref and the value to display.
 */
export function useCountUp<T extends HTMLElement>(target: number, durationMs = 1600) {
  const ref = useRef<T>(null)
  const [value, setValue] = useState(() => (canAnimate() ? 0 : target))

  useEffect(() => {
    const element = ref.current
    if (!element || !canAnimate()) return
    let frame = 0
    const stop = observeOnce(
      element,
      () => {
        const start = performance.now()
        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs)
          setValue(progress >= 1 ? target : target * ease(progress))
          if (progress < 1) frame = requestAnimationFrame(step)
        }
        frame = requestAnimationFrame(step)
      },
      0.6,
    )
    return () => {
      stop()
      cancelAnimationFrame(frame)
    }
  }, [target, durationMs])

  return [ref, value] as const
}
