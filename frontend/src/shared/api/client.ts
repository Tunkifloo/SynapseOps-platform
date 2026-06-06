import { API_BASE_URL } from './env'
import { notify } from '@/shared/notify'

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

  let response: Response
  try {
    response = await fetch(url, { ...init, headers })
  } catch (networkError) {
    // Fallo de red / servidor inalcanzable → notificación global (HU-020).
    notify.error('Sin conexión con el servidor', {
      description: 'Verifica tu red e inténtalo de nuevo.',
    })
    throw networkError
  }

  if (!response.ok) {
    const message = await getProblemDetail(response)
    // Solo los errores INESPERADOS (5xx, incl. 503 del orquestador) se notifican
    // globalmente; los 4xx se manejan inline (validación de formularios, guards).
    if (response.status >= 500) {
      notify.error('Error del servidor', { description: message })
    }
    throw new ApiError(response.status, message)
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
