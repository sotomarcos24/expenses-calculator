import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import type { UserRead } from '../api/types.ts'
import { createQueryClient } from '../lib/queryClient.ts'
import { routes } from '../routes.tsx'

export const TEST_USER: UserRead = {
  id: 1,
  email: 'ada@example.com',
  created_at: '2026-01-01T00:00:00Z',
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type FetchHandler = (path: string, init: RequestInit) => Response | Promise<Response>

/** Replaces `fetch` with a handler receiving the request path (e.g. `/api/auth/me`). */
export function mockFetch(handler: FetchHandler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) =>
    Promise.resolve(handler(String(input), init)),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** A `fetch` mock where `/api/auth/me` answers with `meStatus` (200 → `TEST_USER`). */
export function mockMe(meStatus: number, other?: FetchHandler) {
  return mockFetch((path, init) => {
    if (path === '/api/auth/me') {
      return meStatus === 200
        ? jsonResponse(TEST_USER)
        : jsonResponse({ detail: `status ${meStatus}` }, meStatus)
    }
    if (other) {
      return other(path, init)
    }
    throw new Error(`Unexpected request: ${path}`)
  })
}

/**
 * Renders the real app routes at `path` with a fresh `createQueryClient()`. `probe` is rendered
 * above every route, inside the router and the query provider, so tests can call app hooks.
 */
export function renderApp(path: string, { probe }: { probe?: ReactNode } = {}) {
  const queryClient = createQueryClient()
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            {probe}
            <Outlet />
          </>
        ),
        children: routes,
      },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}
