/** Thin, typed fetch client. Auth uses the backend's httpOnly session cookie (same origin via the Vite proxy),
 *  so no token is ever exposed to JavaScript storage. Money arrives as strings and stays exact. */
export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

const BASE = '/api/v1'
let onUnauthorized: ((detail: string) => void) | null = null
export const setUnauthorizedHandler = (fn: (detail: string) => void) => { onUnauthorized = fn }

type Query = Record<string, string | number | boolean | null | undefined>

export function qs(params?: Query): string {
  if (!params) return ''
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)) })
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${path}${qs(query)}`, init)
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : await res.blob()
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    const detail = (data as { detail?: unknown })?.detail
    onUnauthorized?.(typeof detail === 'string' ? detail : '')
  }
  if (!res.ok) {
    const d = data as { detail?: unknown; errors?: { field: string; message: string }[] }
    const msg = typeof d?.detail === 'string' ? d.detail : d?.errors?.map((e) => `${e.field}: ${e.message}`).join('; ') || `Request failed (${res.status})`
    throw new ApiError(res.status, msg, data)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, body ?? {}, query),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
  url: (path: string, query?: Query) => `${BASE}${path}${qs(query)}`,
}

export interface Paged<T> { items: T[]; page: number; page_size: number; total: number; pages: number }
