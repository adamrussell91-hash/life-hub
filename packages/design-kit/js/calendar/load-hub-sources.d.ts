export const HUB_SOURCE_IDS: readonly string[];
export const HUB_SOURCE_LABEL: Readonly<Record<string, string>>;

export type HubSourceStatusRow = {
  status: string;
  error: string | null;
  count: number;
  label: string;
};

export type HubSourceLoader = {
  loadAll(): Promise<unknown[]>;
  retry(sourceId: string): Promise<void>;
  getEvents(): unknown[];
  getStatuses(): Record<string, HubSourceStatusRow>;
  getMeta(sourceId: string): unknown;
  getTerms(): { term: number | null; starts_on: string; ends_on: string }[];
  getVisual(): unknown;
  legacySourceStatus(): Record<string, string>;
};

export function createHubSourceLoader(opts: {
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  loadLife?: () => Promise<unknown[]>;
  today?: string;
  onChange?: () => void;
}): HubSourceLoader;

export function paintSourceErrors(
  doc: Document,
  host: HTMLElement,
  statuses: Record<string, { status: string; error?: string | null; label?: string }>,
  onRetry: (sourceId: string) => void
): void;
