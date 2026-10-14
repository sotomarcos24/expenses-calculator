import { describe, expect, it } from 'vitest'
import {
  CATEGORY_NAME_REQUIRED,
  CATEGORY_NAME_TOO_LONG,
  categoryNameSchema,
} from './categorySchemas.ts'

function firstError(value: string) {
  const result = categoryNameSchema.safeParse(value)
  return result.success ? undefined : result.error.issues[0]?.message
}

describe('categoryNameSchema', () => {
  it('trims the name and keeps its case', () => {
    expect(categoryNameSchema.parse('  Health  ')).toBe('Health')
    expect(categoryNameSchema.parse('FOOD')).toBe('FOOD')
  })

  it('rejects empty and whitespace-only names', () => {
    expect(firstError('')).toBe(CATEGORY_NAME_REQUIRED)
    expect(firstError('   ')).toBe(CATEGORY_NAME_REQUIRED)
  })

  it('accepts 100 characters and rejects 101', () => {
    expect(categoryNameSchema.parse('a'.repeat(100))).toBe('a'.repeat(100))
    expect(categoryNameSchema.parse(` ${'a'.repeat(100)} `)).toBe('a'.repeat(100))
    expect(firstError('a'.repeat(101))).toBe(CATEGORY_NAME_TOO_LONG)
  })

  it('uses the agreed messages', () => {
    expect(CATEGORY_NAME_REQUIRED).toBe('Name is required')
    expect(CATEGORY_NAME_TOO_LONG).toBe('Name must be at most 100 characters')
  })
})
