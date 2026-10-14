import type { CategoryKind, CategoryTreeNode } from '../api/types.ts'

/**
 * The single inline editor open on the Categories page (only one at a time, across both
 * sections). `error` is the message of the last failed request, shown next to the editor;
 * `failed` keeps a delete error on its row after the confirmation has closed.
 */
export type CategoryEditor =
  | { type: 'add'; kind: CategoryKind; parentId: number | null; error?: string }
  | { type: 'rename'; kind: CategoryKind; id: number; name: string; error?: string }
  | { type: 'delete'; kind: CategoryKind; id: number }
  | { type: 'failed'; kind: CategoryKind; id: number; error: string }

/** Text of the delete confirmation, e.g. `Delete "Housing" and its 3 subcategories?`. */
export function deleteConfirmationText(name: string, subcategoryCount: number) {
  if (subcategoryCount === 0) {
    return `Delete "${name}"?`
  }
  const noun = subcategoryCount === 1 ? 'subcategory' : 'subcategories'
  return `Delete "${name}" and its ${subcategoryCount} ${noun}?`
}

/** Whether the row the editor belongs to is still in `categories` (it may vanish after a 404). */
export function editorTargetExists(categories: CategoryTreeNode[], editor: CategoryEditor) {
  const id = editor.type === 'add' ? editor.parentId : editor.id
  if (id === null) {
    return true
  }
  return categories.some(
    (category) =>
      category.id === id || category.subcategories.some((subcategory) => subcategory.id === id),
  )
}

/** The error message of `editor`, if any. */
export function editorError(editor: CategoryEditor | null) {
  return editor && 'error' in editor ? editor.error : undefined
}
