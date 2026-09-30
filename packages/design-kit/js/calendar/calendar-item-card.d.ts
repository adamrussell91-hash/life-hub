export function itemCardValues(item: unknown): {
  title: string;
  date: string;
  time: string;
  end: string;
  duration: number;
  notes: string;
};
export function itemCardHtml(
  item: unknown,
  opts?: {
    kind?: string;
    routeFor?: (item: unknown) => string | null | undefined;
    location?: { href: string } | null;
    readOnlyNote?: string;
  }
): string;
export function itemCardPatch(item: unknown, form: Record<string, string>): Record<string, unknown>;
export function bindItemCard(
  node: HTMLElement,
  item: unknown,
  handlers?: { onSave?: (patch: Record<string, unknown>) => unknown; onClose?: () => void }
): void;
export function isStandaloneApp(
  view:
    | { navigator?: { standalone?: boolean }; matchMedia?: (query: string) => { matches: boolean } }
    | null
    | undefined
): boolean;
