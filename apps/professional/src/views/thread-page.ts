import { getThread, patchThread } from '@/api/threads';
import { listUniversalLinksForEntity } from '@/api/universal-links';
import { listLedgerForSources } from '@/api/ledger';
import { caseSummaryText } from '@/lib/case-summary';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { LedgerItem, ThreadGoal, ThreadRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

type Member = { ref: string; label: string; href: string | null; at: string };

export async function renderThreadPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  let thread: ThreadRecord;
  let members: Member[];
  let ledger: LedgerItem[];
  const circle = new Map<string, string>();
  try {
    thread = (await getThread(id)).thread;
    const threadRef = `professional:thread:${id}`;
    const incoming = (await listUniversalLinksForEntity(threadRef)).incoming
      .filter((entry) => entry.link.relationship_type === 'in_thread' && entry.link.status === 'current');
    members = incoming
      .map((entry) => ({
        ref: entry.link.source_ref,
        label: entry.endpoint!.display_label,
        href: entry.endpoint!.href ?? null,
        at: String(entry.link.created_at ?? '')
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
    for (const member of members.slice(0, 10)) {
      const links = await listUniversalLinksForEntity(member.ref);
      for (const entry of links.outgoing) {
        if (['recipient', 'about_person'].includes(entry.link.relationship_type)) circle.set(entry.endpoint!.ref, entry.endpoint!.display_label);
      }
    }
    ledger = members.length ? (await listLedgerForSources(members.slice(0, 20).map((member) => member.ref))).items : [];
  } catch (err) {
    renderLoadError(canvas, err, () => void renderThreadPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(thread.title);

  const root = el('div', 'thread-page');
  root.dataset.kind = thread.kind;
  const head = el('header', 'thread-page__head');
  head.append(el('p', 'eyebrow', thread.kind === 'case' ? 'Case' : 'Thread'),
    el('p', 'muted', `${members.length} in ${thread.kind === 'case' ? 'case' : 'thread'}`));
  const kindToggle = el('button', 'btn btn--ghost', thread.kind === 'case' ? 'Make it a general thread' : 'Make it a case') as HTMLButtonElement;
  kindToggle.type = 'button';
  kindToggle.addEventListener('click', async () => {
    await patchThread(id, { kind: thread.kind === 'case' ? 'general' : 'case', ...(thread.kind === 'case' ? { goals: [] } : {}) });
    await renderThreadPage(canvas, id, options);
  });
  head.append(kindToggle);

  const sessions = el('section', 'thread-page__sessions');
  sessions.dataset.part = 'sessions';
  sessions.append(el('h3', undefined, 'Sessions'));
  for (const member of members) {
    const row = el('a', 'thread-page__session', member.label) as HTMLAnchorElement;
    if (member.href) row.href = member.href.replace(/^\/professional\//, '');
    sessions.append(row);
  }

  const side = el('aside', 'thread-page__side');
  if (thread.kind === 'case') side.append(goalsCard(thread, id));
  const circleCard = el('section', 'card');
  circleCard.dataset.part = 'circle';
  circleCard.append(el('h3', undefined, 'The circle'));
  for (const name of circle.values()) circleCard.append(el('p', 'thread-page__person', name));
  side.append(circleCard);

  const kept = ledger.filter((item) => item.status === 'done').length;
  const stats = el('section', 'card');
  stats.dataset.part = 'stats';
  stats.append(el('h3', undefined, 'Promises'), el('p', undefined, `${kept} of ${ledger.length} kept · ${ledger.filter((item) => item.status === 'open').length} open`));
  side.append(stats);

  if (thread.kind === 'case') {
    const exportBtn = el('button', 'btn btn--secondary', 'Copy case summary') as HTMLButtonElement;
    exportBtn.type = 'button';
    exportBtn.dataset.part = 'export';
    const status = el('p', 'muted');
    exportBtn.addEventListener('click', async () => {
      const text = caseSummaryText({
        title: thread.title,
        goals: thread.goals,
        sessions: members.map((member) => ({ label: member.label, at: member.at || new Date().toISOString(), summary: '' })),
        open: ledger.filter((item) => item.status === 'open').map((item) => ({ text: item.text, direction: item.direction })),
        kept,
        made: ledger.length
      });
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Copied.';
      } catch {
        status.textContent = 'Copy failed. Select the text below instead.';
        const pre = el('pre', 'thread-page__export', text);
        side.append(pre);
      }
    });
    side.append(exportBtn, status);
  }

  const grid = el('div', 'thread-page__grid');
  grid.append(sessions, side);
  root.append(head, grid);
  canvas.replaceChildren(root);
}

function goalsCard(thread: ThreadRecord, id: string): HTMLElement {
  const card = el('section', 'card');
  card.dataset.part = 'goals';
  card.append(el('h3', undefined, 'Goals'));
  const list = el('div', 'goals');
  const render = (goals: ThreadGoal[]) => {
    list.replaceChildren();
    for (const goal of goals) {
      const row = el('div', 'goal');
      const top = el('div', 'goal__top');
      top.append(el('span', undefined, goal.text), el('span', 'muted', goal.note ?? (goal.progress === null ? '' : `${goal.progress}%`)));
      const bar = el('div', 'goal__bar');
      const fill = el('i');
      fill.style.width = `${goal.progress ?? 0}%`;
      bar.append(fill);
      row.append(top, bar);
      list.append(row);
    }
  };
  const input = el('input', 'goal__add') as HTMLInputElement;
  input.placeholder = 'Add a goal…';
  input.setAttribute('aria-label', 'Add goal');
  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' || !input.value.trim()) return;
    const goals = [...thread.goals, { id: `g_${Date.now()}`, text: input.value.trim(), progress: null, note: null }];
    input.value = '';
    thread.goals = (await patchThread(id, { goals })).thread.goals;
    render(thread.goals);
  });
  render(thread.goals);
  card.append(list, input);
  return card;
}
