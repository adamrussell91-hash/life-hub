export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: ApiErrorBody; data?: unknown };
