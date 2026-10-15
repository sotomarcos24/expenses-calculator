import { describe, expect, it } from 'vitest'
import { isSafeRedirectTarget, redirectTargetFromState } from './redirect.ts'

describe('isSafeRedirectTarget', () => {
  it.each(['/', '/investments', '/transactions?type=expense', '/simulator#x', '/logins'])(
    'accepts %s',
    (target) => expect(isSafeRedirectTarget(target)).toBe(true),
  )

  it.each([
    '/login',
    '/login?x=1',
    '/login/',
    '/register',
    '/register#a',
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    'investments',
    '',
    '/a\nb',
    undefined,
    null,
    42,
  ])('rejects %s', (target) => expect(isSafeRedirectTarget(target)).toBe(false))
})

describe('redirectTargetFromState', () => {
  it('returns a safe from', () => {
    expect(redirectTargetFromState({ from: '/investments' })).toBe('/investments')
  })
  it.each([null, undefined, {}, { from: '//evil.com' }, { from: '/login' }, 'x'])(
    'falls back to / for %j',
    (state) => expect(redirectTargetFromState(state)).toBe('/'),
  )
})
