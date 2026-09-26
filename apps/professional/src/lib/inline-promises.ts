export type InlinePromise = { owner: string; text: string };

const LINE = /»\s*(me|[A-Z][\p{L}'’-]*)\s*(?:[·:,-]\s*)?(.*)$/u;

/** Each line that starts with » is a promise: `»me …` is yours, `»Name …` is theirs. */
export function extractInlinePromises(text: string): InlinePromise[] {
  const out: InlinePromise[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const match = LINE.exec(line);
    if (!match || line.indexOf('»') !== 0) continue;
    const body = (match[2] ?? '').trim();
    if (!body) continue;
    out.push({ owner: match[1]!, text: body });
  }
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ');
}

/** Every html/text string in a block tree, one line each. */
export function blockPlainText(blocks: unknown[]): string {
  const lines: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((key === 'html' || key === 'text') && typeof child === 'string') {
        for (const line of (key === 'html' ? stripHtml(child) : child).split('\n')) {
          const trimmed = line.replace(/\s+/g, ' ').trim();
          if (trimmed) lines.push(trimmed);
        }
      } else if (typeof child === 'object') {
        visit(child);
      }
    }
  };
  visit(blocks);
  return lines.join('\n');
}

export type PersonOnPage = { ref: string; name: string };

/** `me` owes the first person on the page; a name is someone on the page who owes you. */
export function resolvePromiseOwner(
  owner: string,
  people: PersonOnPage[]
): { direction: 'you_owe' | 'they_owe'; person_ref: string } | null {
  if (owner.toLowerCase() === 'me') {
    return people[0] ? { direction: 'you_owe', person_ref: people[0].ref } : null;
  }
  const lower = owner.toLowerCase();
  const hit = people.find((person) => person.name.toLowerCase().split(/\s+/)[0] === lower);
  return hit ? { direction: 'they_owe', person_ref: hit.ref } : null;
}
