import type { T } from './i18n'

const API = '/api'

export type Role = 'USER' | 'IT_SUPPORT' | 'IT_ADMIN'
export type User = { id: string; full_name: string; email: string; role: Role; is_active?: boolean; created_at?: string }
export type Staff = { id: string; full_name: string; role: Role }
export type Category = { id: string; name: string; description: string | null }

export type Ticket = {
  id: string; ticket_code: string; title: string; description: string; status: string; priority: string
  created_by: string; creator_name: string | null; assigned_to: string | null; assignee_name: string | null
  category_id: string | null; category_name: string | null; resolution: string | null
  created_at: string; updated_at: string
}
export type Comment = {
  id: string; user_id: string; user_name: string | null; user_role: Role | null
  content: string; is_internal: boolean; created_at: string
}
export type TicketEvent = {
  id: string; user_name: string | null; action: string; old_value: string | null; new_value: string | null; created_at: string
}
export type TicketDetail = Ticket & { comments: Comment[]; events: TicketEvent[] }
export type TicketStats = {
  total: number; by_status: Record<string, number>; by_priority: Record<string, number>
  unassigned: number; assigned_to_me: number
}

export type DocFile = { id: string; name: string; size: number; content_type: string | null; created_at: string }
export type Doc = {
  id: string; title: string; summary: string | null; topic: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'
  review_note: string | null; created_by: string; author_name: string | null; reviewer_name: string | null
  reviewed_at: string | null; created_at: string; updated_at: string; file_count: number
  content?: string; files?: DocFile[]
}
export type DocStats = { approved: number; pending: number; mine: number; max_upload_mb: number }

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED']
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const ROLES: Role[] = ['USER', 'IT_SUPPORT', 'IT_ADMIN']
export const isStaff = (user: User | null) => user?.role === 'IT_ADMIN' || user?.role === 'IT_SUPPORT'

export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code) }
}

let token = ''
try { token = localStorage.getItem('qit_token') || '' } catch { /* storage unavailable */ }

export const getToken = () => token
export function setToken(value: string) {
  token = value
  try { value ? localStorage.setItem('qit_token', value) : localStorage.removeItem('qit_token') } catch { /* ignore */ }
}

function toError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return new ApiError(detail, status)
  if (status === 422) return new ApiError('validation', status)
  return new ApiError(status >= 500 ? 'server' : 'generic', status)
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text()
  try { return text ? JSON.parse(text) : {} } catch { return null }
}

export async function api<R = unknown>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<R> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.auth !== false && token) headers.Authorization = `Bearer ${token}`
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError('network', 0)
  }
  const body = await parse(res)
  if (!res.ok || body === null) {
    // An expired or revoked session anywhere in the app sends the user back to the login screen.
    if (res.status === 401 && options.auth !== false) window.dispatchEvent(new Event('qit:unauthorized'))
    throw toError(res.status, body)
  }
  return body as R
}

/** Query string from an object, skipping empty values. */
export function query(params: Record<string, string | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Upload one file with progress (fetch cannot report upload progress, XMLHttpRequest can). */
export function uploadFile(path: string, file: File, onProgress?: (percent: number) => void): Promise<DocFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onerror = () => reject(new ApiError('network', 0))
    xhr.onload = () => {
      let body: unknown = null
      try { body = JSON.parse(xhr.responseText) } catch { /* not JSON, e.g. an nginx error page */ }
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body as DocFile)
      else if (xhr.status === 413) reject(new ApiError('file_too_large', 413))
      else reject(toError(xhr.status, body))
    }
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}

/** Downloads need the bearer token, so fetch the file and hand it to the browser as a blob. */
export async function downloadFile(path: string, name: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new ApiError('network', 0)
  }
  if (!res.ok) throw toError(res.status, await parse(res))
  const url = URL.createObjectURL(await res.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function errorText(error: unknown, t: T): string {
  if (error instanceof ApiError) {
    const key = `err.${error.code}`
    const text = t(key, { status: error.status })
    return text === key ? t('err.generic') : text
  }
  return t('err.generic')
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
