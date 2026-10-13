export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * JSON fetch against the backend. The auth cookie is sent automatically (same origin).
 * Mutating requests always carry `Content-Type: application/json`, even without a body:
 * the backend rejects them with 415 otherwise (CSRF guard, tech spec §5).
 */
export async function apiFetch<T>(path: string, { body, headers, ...init }: RequestOptions = {}) {
  const isMutating = MUTATING_METHODS.has((init.method ?? 'GET').toUpperCase())
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...((body !== undefined || isMutating) && { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new ApiError(response.status, payload?.detail ?? null)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}
