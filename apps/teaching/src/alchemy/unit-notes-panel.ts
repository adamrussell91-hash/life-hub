import { apiGet, apiPost } from '@/api/client';
import { knowledgeHubPageUrl } from '@/alchemy/connections';
import { knowledgeHubOrigin } from '@/alchemy/client';
import { awaitAlchemyJob } from '@/alchemy/jobs';

type UnitNote = { id: string; title: string; why?: string };

/**
 * The unit's shelf of Knowledge Hub notes. Ann reads it before the wider
 * archive and adds to it as she finds notes useful; the teacher can prune it
 * or ask Ann to scan the archive for the whole unit.
 */
export function mountUnitNotesPanel(host: HTMLElement, unitId: string): { refresh(): void; dispose(): void } {
  const panel = document.createElement('details');
  panel.className = 'unit-notes';
  const summary = document.createElement('summary');
  summary.className = 'unit-notes__summary';
  const label = document.createElement('span');
  label.textContent = 'Unit notes';
  const count = document.createElement('span');
  count.className = 'unit-notes__count';
  summary.append(label, count);

  const intro = document.createElement('p');
  intro.className = 'unit-notes__intro';
  intro.textContent = 'Knowledge Hub notes Ann has found useful for this unit. She reads these first when you ask about a block.';
  const list = document.createElement('ul');
  list.className = 'unit-notes__list';
  const actions = document.createElement('div');
  actions.className = 'unit-notes__actions';
  const gather = document.createElement('button');
  gather.type = 'button';
  gather.className = 'btn btn--ghost';
  gather.textContent = 'Gather notes';
  const status = document.createElement('p');
  status.className = 'unit-notes__status';
  status.setAttribute('role', 'status');
  actions.append(gather, status);
  panel.append(summary, intro, list, actions);
  host.append(panel);

  let disposed = false;
  function paint(notes: UnitNote[]): void {
    count.textContent = notes.length ? String(notes.length) : '';
    list.replaceChildren();
    if (!notes.length) {
      const empty = document.createElement('li');
      empty.className = 'unit-notes__empty';
      empty.textContent = 'No notes yet. Ask Ann about a block, or gather notes for the whole unit.';
      list.append(empty);
      return;
    }
    for (const note of notes) {
      const item = document.createElement('li');
      item.className = 'unit-notes__item';
      const text = document.createElement('div');
      const link = document.createElement('a');
      link.href = knowledgeHubPageUrl(knowledgeHubOrigin(), note.id);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = note.title || 'Untitled note';
      text.append(link);
      if (note.why) {
        const why = document.createElement('p');
        why.className = 'unit-notes__why';
        why.textContent = note.why;
        text.append(why);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'unit-notes__remove';
      remove.setAttribute('aria-label', `Remove ${note.title || 'note'} from unit notes`);
      remove.title = 'Remove from unit notes';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        remove.disabled = true;
        void apiPost<{ notes: UnitNote[] }>('/api/alchemy-unit-notes', { unit: unitId, remove: note.id })
          .then((result) => { if (!disposed) paint(result.notes); })
          .catch(() => { remove.disabled = false; status.textContent = 'Could not remove that note. Try again.'; });
      });
      item.append(text, remove);
      list.append(item);
    }
  }

  function refresh(): void {
    void apiGet<{ notes: UnitNote[] }>(`/api/alchemy-unit-notes?unit=${encodeURIComponent(unitId)}`)
      .then((result) => { if (!disposed) paint(result.notes); })
      .catch(() => { if (!disposed) status.textContent = 'Unit notes could not load.'; });
  }

  gather.addEventListener('click', () => {
    gather.disabled = true;
    status.textContent = 'Ann is reading the archive for this unit…';
    type Gathered = { notes: UnitNote[]; added: number };
    void apiPost<Gathered>('/api/alchemy-unit-notes', { unit: unitId, action: 'gather' })
      .then((first) => awaitAlchemyJob<Gathered>(first))
      .then((result) => {
        if (disposed) return;
        paint(result.notes);
        status.textContent = result.added ? `Ann kept ${result.added} note${result.added === 1 ? '' : 's'}.` : 'Ann found nothing new worth keeping.';
      })
      .catch((error) => { if (!disposed) status.textContent = error instanceof Error ? error.message : 'Ann could not scan the archive.'; })
      .finally(() => { gather.disabled = false; });
  });
  // Ann adds notes while you work, so reopening shows the latest shelf.
  panel.addEventListener('toggle', () => { if (panel.open) refresh(); });
  refresh();

  return { refresh, dispose() { disposed = true; panel.remove(); } };
}
