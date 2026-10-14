import { useId, useState, type ReactNode } from 'react'
import type { CategoryKind, CategoryRead, CategoryTreeNode } from '../api/types.ts'
import {
  deleteConfirmationText,
  editorError,
  editorTargetExists,
  type CategoryEditor,
} from '../lib/categoryEditor.ts'
import { Button } from './Button.tsx'
import { CategoryNameForm } from './CategoryNameForm.tsx'
import { DeleteConfirmation } from './DeleteConfirmation.tsx'

type CategoryTreeProps = {
  categories: CategoryTreeNode[]
  /** Kind of the section; new top-level categories get it. */
  kind: CategoryKind
  /** Accessible name of the list, e.g. "Expense categories". */
  label: string
  emptyMessage: string
  /** The inline editor open on the page (shared by both sections), if any. */
  editor: CategoryEditor | null
  /** A category request is in flight. */
  pending: boolean
  /** Opens an editor (closing any other one), or closes it with `null`. */
  onEditorChange: (editor: CategoryEditor | null) => void
  /** Saves the name typed in the open add / rename editor. */
  onSave: (name: string) => void
  /** Confirms the open delete editor. */
  onConfirmDelete: () => void
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
      {children}
    </svg>
  )
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`size-4 shrink-0 text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
    >
      <path
        fillRule="evenodd"
        d="M7.2 14.8a.75.75 0 0 1 0-1.06L10.94 10 7.2 6.26a.75.75 0 1 1 1.06-1.06l4.27 4.27a.75.75 0 0 1 0 1.06L8.26 14.8a.75.75 0 0 1-1.06 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

const PLUS = (
  <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
)
const PENCIL = (
  <path d="M13.59 3.59a2 2 0 0 1 2.82 2.82l-8.5 8.5a1 1 0 0 1-.46.26l-3.2.8a.5.5 0 0 1-.61-.6l.8-3.21a1 1 0 0 1 .26-.46l8.89-8.11Z" />
)
const TRASH = (
  <path
    fillRule="evenodd"
    d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.44c-.8.08-1.59.18-2.37.3a.75.75 0 1 0 .22 1.49l.15-.03.84 10.06A2.75 2.75 0 0 0 7.58 18.5h4.84a2.75 2.75 0 0 0 2.74-2.49L16 5.95l.15.03a.75.75 0 1 0 .22-1.49c-.78-.12-1.57-.22-2.37-.3v-.44A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.67.03 2.5.08v-.33c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.33C8.33 4.03 9.16 4 10 4Z"
    clipRule="evenodd"
  />
)

type RowActionsProps = {
  name: string
  onAdd?: () => void
  onRename: () => void
  onDelete: () => void
}

/** Always-visible icon actions of a row; every accessible name includes the item name. */
function RowActions({ name, onAdd, onRename, onDelete }: RowActionsProps) {
  return (
    <div className="flex shrink-0 items-center">
      {onAdd && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Add subcategory to ${name}`}
          onClick={onAdd}
        >
          <Icon>{PLUS}</Icon>
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label={`Rename ${name}`} onClick={onRename}>
        <Icon>{PENCIL}</Icon>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${name}`}
        onClick={onDelete}
        className="hover:text-loss"
      >
        <Icon>{TRASH}</Icon>
      </Button>
    </div>
  )
}

function RowError({ message }: { message?: string }) {
  if (!message) {
    return null
  }
  return (
    <p role="alert" className="px-1 pb-1 text-sm break-words text-loss">
      {message}
    </p>
  )
}

/**
 * Two-level category tree with inline add, rename and delete. Top-level categories with
 * subcategories get an expander button; everything starts collapsed. Expanded state is keyed by
 * category id, so it survives a refetch. Categories are rendered in the given order (never
 * re-sorted). The open editor lives in the page, so only one is open across both sections.
 */
export function CategoryTree({
  categories,
  kind,
  label,
  emptyMessage,
  editor,
  pending,
  onEditorChange,
  onSave,
  onConfirmDelete,
}: CategoryTreeProps) {
  const idPrefix = useId()
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set())

  const toggle = (id: number) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

  const ownEditor = editor?.kind === kind ? editor : null
  const close = () => onEditorChange(null)

  const isEditing = (type: CategoryEditor['type'], id: number) =>
    ownEditor !== null && ownEditor.type === type && 'id' in ownEditor && ownEditor.id === id

  const openAddSubcategory = (parent: CategoryTreeNode) => {
    setExpanded((current) => new Set(current).add(parent.id))
    onEditorChange({ type: 'add', kind, parentId: parent.id })
  }

  /** Name, or the rename form in its place, plus the delete confirmation and row error. */
  const editorsFor = (category: CategoryRead | CategoryTreeNode, subcategoryCount: number) => ({
    renaming: isEditing('rename', category.id),
    renameForm: (
      <CategoryNameForm
        label="Name"
        defaultValue={category.name}
        error={editorError(ownEditor)}
        pending={pending}
        onSave={onSave}
        onCancel={close}
      />
    ),
    below: (
      <>
        {isEditing('delete', category.id) && (
          <DeleteConfirmation
            message={deleteConfirmationText(category.name, subcategoryCount)}
            pending={pending}
            onConfirm={onConfirmDelete}
            onCancel={close}
          />
        )}
        {isEditing('failed', category.id) && <RowError message={editorError(ownEditor)} />}
      </>
    ),
    actions: (onAdd?: () => void) => (
      <RowActions
        name={category.name}
        onAdd={onAdd}
        onRename={() =>
          onEditorChange({ type: 'rename', kind, id: category.id, name: category.name })
        }
        onDelete={() => onEditorChange({ type: 'delete', kind, id: category.id })}
      />
    ),
  })

  const addingTopLevel = ownEditor?.type === 'add' && ownEditor.parentId === null
  // A request for a row that has since disappeared (404): show its message under the tree.
  const orphanError =
    ownEditor && !editorTargetExists(categories, ownEditor) ? editorError(ownEditor) : undefined

  return (
    <>
      {categories.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted">{emptyMessage}</p>
      ) : (
        <ul aria-label={label} className="divide-y divide-border">
          {categories.map((category) => {
            const isExpanded = expanded.has(category.id)
            const listId = `${idPrefix}-subcategories-${category.id}`
            const hasChildren = category.subcategories.length > 0
            const addingHere = ownEditor?.type === 'add' && ownEditor.parentId === category.id
            const row = editorsFor(category, category.subcategories.length)
            return (
              <li key={category.id} className="py-1">
                <div className="flex min-w-0 items-start gap-1">
                  {row.renaming ? (
                    row.renameForm
                  ) : hasChildren ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={listId}
                      onClick={() => toggle(category.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-2 text-left text-sm font-medium text-foreground hover:bg-accent hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Chevron expanded={isExpanded} />
                      <span className="min-w-0 break-words">{category.name}</span>
                    </button>
                  ) : (
                    <p className="flex min-w-0 flex-1 items-center gap-2 px-1 py-2 text-sm font-medium text-foreground">
                      {/* Keeps the name aligned with the names that have a chevron. */}
                      <span aria-hidden="true" className="size-4 shrink-0" />
                      <span className="min-w-0 break-words">{category.name}</span>
                    </p>
                  )}
                  {!row.renaming && row.actions(() => openAddSubcategory(category))}
                </div>
                {row.below}
                {(hasChildren || addingHere) && (
                  <ul
                    id={listId}
                    aria-label={`${category.name} subcategories`}
                    hidden={!isExpanded}
                    className="mb-1 ml-7 border-l border-border pl-3"
                  >
                    {category.subcategories.map((subcategory) => {
                      const subRow = editorsFor(subcategory, 0)
                      return (
                        <li key={subcategory.id} className="min-w-0 text-sm text-muted">
                          <div className="flex min-w-0 items-start gap-1">
                            {subRow.renaming ? (
                              subRow.renameForm
                            ) : (
                              <span className="min-w-0 flex-1 py-1.5 break-words">
                                {subcategory.name}
                              </span>
                            )}
                            {!subRow.renaming && subRow.actions()}
                          </div>
                          {subRow.below}
                        </li>
                      )
                    })}
                    {addingHere && (
                      <li className="min-w-0">
                        <CategoryNameForm
                          label="Subcategory name"
                          error={editorError(ownEditor)}
                          pending={pending}
                          onSave={onSave}
                          onCancel={close}
                        />
                      </li>
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <RowError message={orphanError} />
      <div className="mt-2">
        {addingTopLevel ? (
          <CategoryNameForm
            label="Category name"
            error={editorError(ownEditor)}
            pending={pending}
            onSave={onSave}
            onCancel={close}
          />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEditorChange({ type: 'add', kind, parentId: null })}
          >
            Add category
          </Button>
        )}
      </div>
    </>
  )
}
