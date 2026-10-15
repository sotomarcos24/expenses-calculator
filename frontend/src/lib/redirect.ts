/** Where to go after login when no safe `from` location was passed. */
export const DEFAULT_AFTER_LOGIN = '/'

/**
 * True when `target` is an internal app path that is safe to navigate to after login: it starts
 * with a single `/` (so no `//host`, scheme or backslash tricks) and its pathname is not an
 * auth page.
 */
export function isSafeRedirectTarget(target: unknown): target is string {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) {
    return false
  }
  if (target.includes('\\') || [...target].some((char) => char.charCodeAt(0) < 0x20)) {
    return false
  }
  const pathname = target.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/'
  return pathname !== '/login' && pathname !== '/register'
}

/** Reads `state.from` (a path + search string) from router state; falls back to `/`. */
export function redirectTargetFromState(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from
  return isSafeRedirectTarget(from) ? from : DEFAULT_AFTER_LOGIN
}
