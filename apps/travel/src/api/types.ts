export interface ApiErrorBody {
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorBody; data?: unknown };
