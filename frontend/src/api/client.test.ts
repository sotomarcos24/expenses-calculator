import { describe, expect, it } from 'vitest'
import { jsonResponse, mockFetch } from '../test/renderApp.tsx'
import { ApiError, apiFetch } from './client.ts'

function sentHeaders(fetchMock: ReturnType<typeof mockFetch>) {
  const init = fetchMock.mock.calls[0][1] as RequestInit
  return new Headers(init.headers)
}

describe('apiFetch', () => {
  it('sends Content-Type on a body-less POST', async () => {
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }))

    await expect(apiFetch('/x', { method: 'POST' })).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith('/api/x', expect.anything())
    expect(sentHeaders(fetchMock).get('Content-Type')).toBe('application/json')
  })

  it.each(['put', 'PATCH', 'Delete'])('sends Content-Type for %s (any case)', async (method) => {
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }))

    await apiFetch('/x', { method })

    expect(sentHeaders(fetchMock).get('Content-Type')).toBe('application/json')
  })

  it('does not send Content-Type on GET', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }))

    await expect(apiFetch('/x')).resolves.toEqual({ ok: true })
    await apiFetch('/x', { method: 'GET' })

    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers((init as RequestInit).headers).has('Content-Type')).toBe(false)
    }
  })

  it('serialises the body and lets caller headers override', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ id: 1 }, 201))

    await apiFetch('/x', { method: 'POST', body: { a: 1 }, headers: { 'Content-Type': 'text/x' } })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBe('{"a":1}')
    expect(sentHeaders(fetchMock).get('Content-Type')).toBe('text/x')
  })

  it('throws ApiError with the status and detail on non-2xx', async () => {
    mockFetch(() => jsonResponse({ detail: 'Nope' }, 409))

    const error = await apiFetch('/x', { method: 'POST' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, detail: 'Nope' })
  })
})
