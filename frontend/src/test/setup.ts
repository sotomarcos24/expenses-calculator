import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { installMatchMedia, MOBILE_WIDTH } from './matchMedia.ts'

// jsdom has no `matchMedia`: every test starts at a mobile width unless it calls `resizeTo`.
beforeEach(() => {
  installMatchMedia(MOBILE_WIDTH)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
