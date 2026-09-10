export type AlchemyMode = 'synthesis' | 'retrieval' | 'empty' | 'local';

export type AlchemyConnection = {
  icon: string;
  summary: string;
  sourcePageId: string;
  sourcePageTitle: string;
  sourceExcerpt: string;
  whyNonObvious: string;
};

export type AlchemyResult = {
  connections: AlchemyConnection[];
  mode: AlchemyMode;
};

const MODES = new Set<AlchemyMode>(['synthesis', 'retrieval', 'empty', 'local']);

function asConnection(raw: unknown): AlchemyConnection | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.sourcePageId !== 'string' || typeof item.summary !== 'string') return null;
  return {
    icon: typeof item.icon === 'string' ? item.icon : '',
    summary: item.summary,
    sourcePageId: item.sourcePageId,
    sourcePageTitle: typeof item.sourcePageTitle === 'string' ? item.sourcePageTitle : '',
    sourceExcerpt: typeof item.sourceExcerpt === 'string' ? item.sourceExcerpt : '',
    whyNonObvious: typeof item.whyNonObvious === 'string' ? item.whyNonObvious : ''
  };
}

export function parseAlchemyResult(raw: unknown): AlchemyResult {
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const connections = Array.isArray(payload.connections)
    ? payload.connections.map(asConnection).filter((item): item is AlchemyConnection => Boolean(item)).slice(0, 5)
    : [];
  const mode = MODES.has(payload.mode as AlchemyMode) ? (payload.mode as AlchemyMode) : 'empty';
  return { connections, mode };
}

export function knowledgeHubPageUrl(origin: string, pageId: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/#page/${encodeURIComponent(pageId)}`;
}

export function alchemyModeLabel(mode: AlchemyMode | ''): string {
  if (mode === 'synthesis') return 'Claude synthesis';
  if (mode === 'retrieval') return 'Retrieval only (no Anthropic key)';
  if (mode === 'local') return 'Local lexical retrieval';
  if (mode === 'empty') return 'No candidates';
  return '';
}
