import { describe, expect, it } from 'vitest'
import type { CategoryTreeNode } from '../api/types.ts'
import { deleteConfirmationText, editorError, editorTargetExists } from './categoryEditor.ts'

const TREE: CategoryTreeNode[] = [
  {
    id: 1,
    name: 'Food',
    kind: 'expense',
    parent_id: null,
    subcategories: [{ id: 2, name: 'Groceries', kind: 'expense', parent_id: 1 }],
  },
]

describe('deleteConfirmationText', () => {
  it('mentions the subcategories, singular or plural', () => {
    expect(deleteConfirmationText('Other', 0)).toBe('Delete "Other"?')
    expect(deleteConfirmationText('Food', 1)).toBe('Delete "Food" and its 1 subcategory?')
    expect(deleteConfirmationText('Housing', 3)).toBe('Delete "Housing" and its 3 subcategories?')
  })
})

describe('editorTargetExists', () => {
  it('finds top-level categories and subcategories', () => {
    expect(editorTargetExists(TREE, { type: 'add', kind: 'expense', parentId: null })).toBe(true)
    expect(editorTargetExists(TREE, { type: 'add', kind: 'expense', parentId: 1 })).toBe(true)
    expect(editorTargetExists(TREE, { type: 'delete', kind: 'expense', id: 2 })).toBe(true)
    expect(editorTargetExists(TREE, { type: 'add', kind: 'expense', parentId: 9 })).toBe(false)
    expect(editorTargetExists(TREE, { type: 'failed', kind: 'expense', id: 9, error: 'x' })).toBe(
      false,
    )
  })
})

describe('editorError', () => {
  it('returns the error of the editor, if any', () => {
    expect(editorError(null)).toBeUndefined()
    expect(editorError({ type: 'delete', kind: 'income', id: 1 })).toBeUndefined()
    expect(editorError({ type: 'rename', kind: 'income', id: 1, name: 'A', error: 'E' })).toBe('E')
  })
})
