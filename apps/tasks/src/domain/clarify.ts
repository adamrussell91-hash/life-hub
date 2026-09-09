/**
 * Clarify — deterministic classification of brain-dump commitments.
 * Classification must be structured before any write.
 */

export const CLARIFY_DESTINATIONS = [
  'next_action',
  'project',
  'waiting',
  'calendar',
  'someday',
  'reference',
  'trash'
] as const;

export type ClarifyDestination = (typeof CLARIFY_DESTINATIONS)[number];

export type ClarifyItem = {
  id: string;
  text: string;
  destination: ClarifyDestination;
  missing: string[];
  ambiguous: boolean;
  question: string | null;
  project_next_action: string | null;
  waiting_on: string | null;
  calendar_date: string | null;
};

export type ClarifyStack = {
  items: ClarifyItem[];
  source_text: string;
};

const WAITING_RE =
  /\b(waiting\s+(on|for)|wait\s+for|follow\s*up\s+with|heard\s+back\s+from)\b/i;
const SOMEDAY_RE = /\b(someday|maybe|one\s+day|eventually|park\s+this|incubate)\b/i;
const CALENDAR_RE =
  /\b(meeting|appointment|lesson|class|interview|call\s+at|on\s+\d{1,2}[\/\-]\d{1,2})\b/i;
const PROJECT_RE =
  /\b(project|plan\s+the|organise|organize|launch|build\s+out|multi[- ]step)\b/i;
const REFERENCE_RE = /\b(reference|note\s+to\s+self|fyi|bookmark|read\s+later\s+ref)\b/i;
const TRASH_RE = /\b(trash|delete|ignore|never\s+mind|nvm|cancel\s+that)\b/i;
const PERSON_RE = /\b(?:from|for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/;

function splitCommitments(text: string): string[] {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const lines = raw
    .split(/\n+|•|\u2022|(?:^|\s)[-*]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  return raw
    .split(/(?<=[.!?])\s+(?=[A-Z])|(?:\s*;\s*)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function classifyOne(text: string, index: number): ClarifyItem {
  const id = `clarify_${index + 1}`;
  const missing: string[] = [];
  let destination: ClarifyDestination = 'next_action';
  let ambiguous = false;
  let question: string | null = null;
  let project_next_action: string | null = null;
  let waiting_on: string | null = null;
  let calendar_date: string | null = null;

  if (TRASH_RE.test(text)) {
    destination = 'trash';
  } else if (WAITING_RE.test(text)) {
    destination = 'waiting';
    const person = text.match(PERSON_RE);
    waiting_on = person?.[1] ?? null;
    if (!waiting_on) {
      missing.push('waiting_on');
      ambiguous = true;
      question = 'Who or what are you waiting on?';
    }
  } else if (SOMEDAY_RE.test(text)) {
    destination = 'someday';
  } else if (CALENDAR_RE.test(text)) {
    destination = 'calendar';
    const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/);
    calendar_date = dateMatch?.[1] ?? null;
    if (!calendar_date) {
      missing.push('calendar_date');
      ambiguous = true;
      question = 'Which date belongs on the calendar?';
    }
  } else if (REFERENCE_RE.test(text)) {
    destination = 'reference';
  } else if (PROJECT_RE.test(text) || /\band\b.+\band\b/i.test(text)) {
    destination = 'project';
    project_next_action = `Define first next action for: ${text.slice(0, 80)}`;
  } else {
    destination = 'next_action';
  }

  // Ceremony rule: no question when classification is clear.
  if (!ambiguous) question = null;

  return {
    id,
    text,
    destination,
    missing,
    ambiguous,
    question,
    project_next_action,
    waiting_on,
    calendar_date
  };
}

export function clarifyDump(text: string): ClarifyStack {
  const parts = splitCommitments(text);
  return {
    source_text: text,
    items: parts.map((part, i) => classifyOne(part, i))
  };
}

export function reclassifyItem(
  stack: ClarifyStack,
  itemId: string,
  destination: ClarifyDestination
): ClarifyStack {
  return {
    ...stack,
    items: stack.items.map((item) => {
      if (item.id !== itemId) return item;
      const next = { ...item, destination, ambiguous: false, question: null, missing: [] as string[] };
      if (destination === 'waiting' && !next.waiting_on) {
        next.missing = ['waiting_on'];
        next.ambiguous = true;
        next.question = 'Who or what are you waiting on?';
      }
      if (destination === 'project' && !next.project_next_action) {
        next.project_next_action = `Define first next action for: ${next.text.slice(0, 80)}`;
      }
      return next;
    })
  };
}
