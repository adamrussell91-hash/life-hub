export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResult<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: ApiErrorBody };
