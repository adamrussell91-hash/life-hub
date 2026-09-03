import {
  DEFAULT_AGENT_PROTOCOLS,
  type AgentProtocolSlug
} from '@/domain/defaults/agent-protocols';

export type { AgentProtocolSlug };

export type AgentProtocolDoc = {
  schema_version: 1;
  slug: AgentProtocolSlug;
  markdown: string;
  updated_at: string | null;
};

export const MAX_PROTOCOL_CHARS = 24_000;

const SLUGS = new Set<AgentProtocolSlug>(['clare', 'hammond', 'penelope', 'vera']);

export function isAgentProtocolSlug(value: string): value is AgentProtocolSlug {
  return SLUGS.has(value as AgentProtocolSlug);
}

export function defaultAgentProtocol(slug: AgentProtocolSlug): AgentProtocolDoc {
  return {
    schema_version: 1,
    slug,
    markdown: DEFAULT_AGENT_PROTOCOLS[slug],
    updated_at: null
  };
}

export function parseAgentProtocol(raw: unknown, slug: AgentProtocolSlug): AgentProtocolDoc {
  if (!raw || typeof raw !== 'object') return defaultAgentProtocol(slug);
  const body = raw as Record<string, unknown>;
  const markdown =
    typeof body.markdown === 'string' && body.markdown.trim()
      ? body.markdown.slice(0, MAX_PROTOCOL_CHARS)
      : DEFAULT_AGENT_PROTOCOLS[slug];
  return {
    schema_version: 1,
    slug,
    markdown,
    updated_at: typeof body.updated_at === 'string' ? body.updated_at : null
  };
}

export type ProtocolUpdateMode = 'replace' | 'append' | 'replace_section';

export function applyProtocolUpdate(
  current: string,
  input: {
    mode: ProtocolUpdateMode;
    markdown: string;
    section_heading?: string;
  }
): { ok: true; markdown: string; note: string } | { ok: false; markdown: string; note: string } {
  const chunk = input.markdown.trim();
  if (!chunk) {
    return { ok: false, markdown: current, note: 'Empty protocol update — nothing written.' };
  }

  let next = current;
  if (input.mode === 'replace') {
    next = chunk;
  } else if (input.mode === 'append') {
    next = `${current.trimEnd()}\n\n${chunk}`.trim() + '\n';
  } else {
    const heading = (input.section_heading ?? '').trim().replace(/^#+\s*/, '');
    if (!heading) {
      return {
        ok: false,
        markdown: current,
        note: 'replace_section needs section_heading (e.g. "Clock").'
      };
    }
    const pattern = new RegExp(
      `(^|\\n)##\\s+${escapeRegExp(heading)}\\b[\\s\\S]*?(?=\\n##\\s+|$)`,
      'i'
    );
    if (!pattern.test(current)) {
      next = `${current.trimEnd()}\n\n## ${heading}\n\n${chunk}\n`;
    } else {
      next = current.replace(pattern, `$1## ${heading}\n\n${chunk}\n`);
    }
  }

  if (next.length > MAX_PROTOCOL_CHARS) {
    return {
      ok: false,
      markdown: current,
      note: `Protocol would exceed ${MAX_PROTOCOL_CHARS} characters — shorten it.`
    };
  }
  return {
    ok: true,
    markdown: next,
    note:
      input.mode === 'replace'
        ? 'Replaced operating protocol.'
        : input.mode === 'append'
          ? 'Appended to operating protocol.'
          : `Updated section “${input.section_heading}”.`
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
