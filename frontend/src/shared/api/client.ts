import { API_BASE_URL } from './env'

export interface ProblemDetail {
  detail?: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const isApiError = (error: unknown): error is ApiError => (
  error instanceof ApiError
)

const getProblemDetail = async (response: Response) => {
  const problem = await response.json().catch(() => null) as ProblemDetail | null
  return problem?.detail ?? `Request failed with status ${response.status}`
}

export const request = async (url: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers)

  if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new ApiError(response.status, await getProblemDetail(response))
  }

  return response
}

export const requestJson = async <T,>(url: string, init?: RequestInit) => (
  request(url, init).then((response) => response.json() as Promise<T>)
)

export const authorizedRequest = async (path: string, token: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)

  return request(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  })
}

export const fetchJson = async <T,>(path: string, token: string, init?: RequestInit) => (
  authorizedRequest(path, token, init).then((response) => response.json() as Promise<T>)
)

export const sendJson = async <T,>(path: string, token: string, method: string, body: unknown) => (
  fetchJson<T>(path, token, {
    method,
    body: JSON.stringify(body),
  })
)

export const sendVoid = async (path: string, token: string, method: string) => {
  await authorizedRequest(path, token, { method })
}

export const sendText = async (path: string, token: string, method: string, body?: FormData) => {
  const response = await authorizedRequest(path, token, {
    method,
    body,
  })

  return response.text()
}
