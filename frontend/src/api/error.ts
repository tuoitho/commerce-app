export interface ApiErrorDetail {
  code: string
  message: string
  fields?: Record<string, string>
}

export interface ApiError {
  status: number
  detail: ApiErrorDetail
}

export class ApiError extends Error {
  status: number
  detail: ApiErrorDetail

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/** Parses an error response body into an ApiError. */
export function toApiError(status: number, body: unknown): ApiError {
  const err = body as { error?: ApiErrorDetail }
  const detail: ApiErrorDetail =
    err?.error && typeof err.error.message === 'string'
      ? err.error
      : { code: 'internal', message: 'Unexpected server error' }
  return new ApiError(status, detail)
}