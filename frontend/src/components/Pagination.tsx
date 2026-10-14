import { Button } from './Button.tsx'

type PaginationProps = {
  page: number
  pages: number
  /** Disables both buttons (e.g. while a page is loading). */
  disabled?: boolean
  onPageChange: (page: number) => void
}

/** Previous / Next controls with a "Page X of Y" indicator. */
export function Pagination({ page, pages, disabled = false, onPageChange }: PaginationProps) {
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Previous
      </Button>
      <span className="text-sm text-muted">
        Page {page} of {pages}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || page >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  )
}
