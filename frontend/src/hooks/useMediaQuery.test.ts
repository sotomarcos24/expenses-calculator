import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_WIDTH,
  installMatchMedia,
  matchMediaListenerCount,
  MOBILE_WIDTH,
  resizeTo,
} from '../test/matchMedia.ts'
import { MD_MEDIA_QUERY, useMediaQuery } from './useMediaQuery.ts'

describe('useMediaQuery', () => {
  it('uses the Tailwind v4 default md breakpoint', () => {
    expect(MD_MEDIA_QUERY).toBe('(min-width: 48rem)')
  })

  it('returns whether the query matches the current width', () => {
    const { result: mobile } = renderHook(() => useMediaQuery(MD_MEDIA_QUERY))
    expect(mobile.current).toBe(false)

    installMatchMedia(DESKTOP_WIDTH)
    const { result: desktop } = renderHook(() => useMediaQuery(MD_MEDIA_QUERY))
    expect(desktop.current).toBe(true)
  })

  it('matches exactly from 768px (48rem) up', () => {
    installMatchMedia(767)
    const { result } = renderHook(() => useMediaQuery(MD_MEDIA_QUERY))
    expect(result.current).toBe(false)
    resizeTo(768)
    expect(result.current).toBe(true)
  })

  it('updates when the change event fires, in both directions', () => {
    const { result } = renderHook(() => useMediaQuery(MD_MEDIA_QUERY))
    expect(result.current).toBe(false)

    resizeTo(DESKTOP_WIDTH)
    expect(result.current).toBe(true)

    resizeTo(MOBILE_WIDTH)
    expect(result.current).toBe(false)
  })

  it('removes its change listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery(MD_MEDIA_QUERY))
    expect(matchMediaListenerCount(MD_MEDIA_QUERY)).toBe(1)

    unmount()
    expect(matchMediaListenerCount(MD_MEDIA_QUERY)).toBe(0)
  })

  it('re-subscribes when the query changes', () => {
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: MD_MEDIA_QUERY },
    })
    expect(result.current).toBe(false)

    rerender({ query: '(max-width: 600px)' })
    expect(result.current).toBe(true)
    expect(matchMediaListenerCount(MD_MEDIA_QUERY)).toBe(0)
    expect(matchMediaListenerCount('(max-width: 600px)')).toBe(1)
  })
})
