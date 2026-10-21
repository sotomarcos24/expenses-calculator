import { describe, expect, it } from 'vitest'
import css from '../index.css?raw'
import { contrastRatio, parseColorTokens } from './contrast.ts'

const tokens = parseColorTokens(css)
const color = (name: string) => {
  const value = tokens[name]
  expect(value, `token --color-${name}`).toBeDefined()
  return value
}

// [foreground token, background token, minimum ratio, where it is used]
const TEXT_PAIRS: [string, string, number, string][] = [
  ['foreground', 'background', 4.5, 'body text'],
  ['foreground', 'surface', 4.5, 'text on cards and the sidebar'],
  ['foreground', 'accent', 4.5, 'text on hovered rows'],
  ['muted', 'background', 4.5, 'secondary text and placeholders'],
  ['muted', 'surface', 4.5, 'secondary text on surfaces'],
  ['muted', 'accent', 4.5, 'ghost buttons and nav links on hover'],
  ['primary', 'background', 4.5, 'links'],
  ['primary', 'surface', 4.5, 'links on surfaces'],
  ['primary', 'accent', 4.5, 'text on hover'],
  ['primary-hover', 'background', 4.5, 'link hover'],
  ['primary-foreground', 'primary', 4.5, 'primary buttons, active nav'],
  ['primary-foreground', 'primary-hover', 4.5, 'primary button hover'],
  ['primary-foreground', 'loss', 4.5, 'danger buttons'],
  ['primary', 'accent', 4.5, 'landing hero text over the gradient end'],
  ['foreground', 'accent', 4.5, 'landing hero text over the gradient end'],
  ['gain', 'background', 4.5, 'gains (also signed with +)'],
  ['gain', 'surface', 4.5, 'gains on surfaces'],
  ['loss', 'background', 4.5, 'losses and form errors'],
  ['loss', 'surface', 4.5, 'losses on surfaces'],
]

// Non-text: focus ring, input borders and the simulator lines (>= 3:1, WCAG 1.4.11).
const UI_PAIRS: [string, string, number, string][] = [
  ['primary', 'background', 3, 'focus ring'],
  ['primary', 'surface', 3, 'focus ring on surfaces'],
  ['control-border', 'background', 3, 'input, select and textarea borders'],
  ['control-border', 'surface', 3, 'input borders on surfaces'],
  ['scenario-pessimistic', 'background', 3, 'simulator line'],
  ['scenario-base', 'background', 3, 'simulator line'],
  ['scenario-base', 'surface', 3, 'landing chart line'],
  ['scenario-optimistic', 'surface', 3, 'landing chart line'],
  ['scenario-optimistic', 'background', 3, 'simulator line'],
]

describe('palette contrast (WCAG 2.1 AA)', () => {
  it.each(TEXT_PAIRS)('%s on %s is at least %d:1 (%s)', (fg, bg, min) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(min)
  })

  it.each(UI_PAIRS)('%s on %s is at least %d:1 (%s)', (fg, bg, min) => {
    expect(contrastRatio(color(fg), color(bg))).toBeGreaterThanOrEqual(min)
  })

  it('computes known ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })
})
