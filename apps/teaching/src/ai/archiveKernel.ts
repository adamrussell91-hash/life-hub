export type ArchiveFinding = {
  pageId: string;
  title: string;
  excerpt: string;
  stance: string;
};

export type ArchivePull = {
  note: string;
  findings: ArchiveFinding[];
  archiveFailed?: boolean;
};

const DEFAULT_KERNEL_URL = 'https://knowledge-hub-research.adamrussell91.workers.dev';

function asFinding(raw: unknown): ArchiveFinding | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.pageId !== 'string' || typeof item.title !== 'string') return null;
  return {
    pageId: item.pageId,
    title: item.title,
    excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
    stance: typeof item.stance === 'string' ? item.stance : 'related'
  };
}

export async function pullArchive(input: {
  query: string;
  documentContext?: string;
  url?: string;
  secret: string;
  fetchImpl?: typeof fetch;
}): Promise<ArchivePull> {
  const base = (input.url || DEFAULT_KERNEL_URL).replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${base}/quick_research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TeachingHub/1.0',
        'x-research-kernel-secret': input.secret
      },
      body: JSON.stringify({
        query: input.query || 'lesson planning',
        documentContext: input.documentContext
      })
    });
    if (!response.ok) {
      return {
        archiveFailed: true,
        findings: [],
        note: 'The archive pull failed. Say so in character and continue with what you have. Do not invent citations.'
      };
    }
    const payload = (await response.json()) as { findings?: unknown; gaps?: unknown };
    const findings = Array.isArray(payload.findings)
      ? payload.findings.map(asFinding).filter((item): item is ArchiveFinding => Boolean(item))
      : [];
    const gaps = Array.isArray(payload.gaps)
      ? payload.gaps.filter((item): item is string => typeof item === 'string')
      : [];
    if (!findings.length) {
      return {
        findings,
        note: `The archive did not give you anything usable. Name the gaps (${gaps.join('; ') || 'none named'}). Do not say "no results found."`
      };
    }
    return {
      findings,
      note: `Archive findings (cite these; never invent pages):\n${JSON.stringify(findings, null, 2)}`
    };
  } catch {
    return {
      archiveFailed: true,
      findings: [],
      note: 'The archive pull failed. Say so in character and continue with what you have. Do not invent citations.'
    };
  }
}
