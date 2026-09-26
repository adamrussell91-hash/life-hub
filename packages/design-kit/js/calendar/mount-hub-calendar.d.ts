export type HubCalendarAdapter = {
  hub: string;
  fills?: Record<string, string>;
  defaultFilter?: Record<string, boolean>;
  routeFor: (item: unknown) => string | null | undefined;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  getZoom?: () => string;
  setZoom?: (zoom: string) => void;
  loadLife?: () => Promise<unknown[]>;
  today?: string;
  now?: Date;
  rootClass?: string;
  onNavigate?: (href: string) => void;
  onReschedule?: (
    item: unknown,
    patch: { date: string; start_time?: string | null }
  ) => void | Promise<void>;
  onQuickAdd?: () => void;
  quickAddLabel?: string;
  classId?: string;
  eventFilter?: (event: unknown) => boolean;
};

export type HubCalendarHandle = {
  destroy(): void;
  reload(): Promise<void>;
  syncZoom(): Promise<void>;
  getZoom(): string;
  getLoader(): {
    loadAll(): Promise<unknown[]>;
    retry(sourceId: string): Promise<void>;
    getEvents(): unknown[];
    getStatuses(): Record<string, unknown>;
  };
};

export function mountHubCalendar(
  host: HTMLElement,
  adapter: HubCalendarAdapter
): HubCalendarHandle;
