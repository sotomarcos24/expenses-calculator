import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiFetch } from '../api/client.ts'
import type {
  CategoryCreate,
  CategoryKind,
  CategoryRead,
  CategoryTreeNode,
  CategoryUpdate,
} from '../api/types.ts'

/** Cache key of the category trees (both kinds). Invalidate it after any category change. */
export const CATEGORIES_QUERY_KEY = ['categories'] as const

/**
 * Prefix of every category-totals query key. Invalidate it after any transaction, category or
 * monthly amount change.
 */
export const CATEGORY_TOTALS_QUERY_KEY = ['category-totals'] as const

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

/**
 * Callbacks shared by the category mutations: refetch the trees after a success, and after a 404
 * too (the category was already gone, so the tree must resync). The returned promises are awaited
 * by TanStack Query, so `mutateAsync` settles once the refetch is done. No optimistic updates.
 */
function useResyncCategories() {
  const queryClient = useQueryClient()
  const resync = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: CATEGORY_TOTALS_QUERY_KEY }),
    ])
  return {
    onSuccess: resync,
    onError: (error: unknown) =>
      error instanceof ApiError && error.status === 404 ? resync() : undefined,
  }
}

/** `POST /api/categories`: creates a category, or a subcategory when `parent_id` is set. */
export function useCreateCategory() {
  return useMutation({
    mutationFn: (body: CategoryCreate) =>
      apiFetch<CategoryRead>('/categories', { method: 'POST', body }),
    ...useResyncCategories(),
  })
}

/** `PATCH /api/categories/{id}`: renames a category (rename only, no move). */
export function useRenameCategory() {
  return useMutation({
    mutationFn: ({ id, ...body }: CategoryUpdate & { id: number }) =>
      apiFetch<CategoryRead>(`/categories/${id}`, { method: 'PATCH', body }),
    ...useResyncCategories(),
  })
}

/** `DELETE /api/categories/{id}`: deletes a category and its subcategories. */
export function useDeleteCategory() {
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/categories/${id}`, { method: 'DELETE' }),
    ...useResyncCategories(),
  })
}
