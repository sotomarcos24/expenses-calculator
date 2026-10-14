import { useCallback, useSyncExternalStore } from 'react'

/** Tailwind v4's default `md` breakpoint (`--breakpoint-md: 48rem`, not overridden here). */
export const MD_MEDIA_QUERY = '(min-width: 48rem)'

/**
 * Whether `query` currently matches (`window.matchMedia`). Re-renders when the query's `change`
 * event fires and removes its listener on unmount.
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
