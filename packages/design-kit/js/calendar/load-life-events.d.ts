export function batchLifeFileRequests(
  wanted: Array<{ path?: string; sha?: string; size?: number }>
): Array<Array<{ path?: string; sha?: string; size?: number }>>;

export function loadLifeCalendarEvents(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  opts?: { today?: string; from?: string; to?: string }
): Promise<{ events: unknown[]; visual: object | null }>;

export function createLifeEventsLoader(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  opts?: { today?: string }
): {
  load(): Promise<unknown[]>;
  getVisual(): object | null;
};
