import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client.ts'
import type { CategoryKind, CategoryTreeNode } from '../api/types.ts'

/** Cache key of the category trees (both kinds). Invalidate it after any category change. */
export const CATEGORIES_QUERY_KEY = ['categories'] as const

/** Top-level categories of `kind`, keeping the API order (creation order; never re-sorted). */
export function categoriesOfKind(categories: CategoryTreeNode[], kind: CategoryKind) {
  return categories.filter((category) => category.kind === kind)
}

/**
 * The current user's category trees, both kinds in one request (`GET /api/categories`).
 * `expenses` and `income` are filtered on the client, in the order returned by the API.
 */
export function useCategories() {
  const query = useQuery({
    queryKey: CATEGORIES_QUERY_KEY,
    queryFn: () => apiFetch<CategoryTreeNode[]>('/categories'),
  })
  const categories = query.data ?? []
  return {
    ...query,
    expenses: categoriesOfKind(categories, 'expense'),
    income: categoriesOfKind(categories, 'income'),
  }
}
