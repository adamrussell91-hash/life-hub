import { listScanProposals, runCareerScan, keepScanProposal, binScanProposal } from '@/api/career';
import { careerFutureRoute } from '@/app/router';
import type { buildCareerModel } from '@/domain/career-model';

type CareerModel = ReturnType<typeof buildCareerModel>;

type ScanProposal = {
  id: string;
  title: string;
  occurred_on?: string;
  date_precision?: string;
  star?: { situation?: string | null; task?: string | null; action?: string | null; result?: string | null };
  skills?: string[];
  apst?: string[];
  source_refs?: string[];
  source_labels?: Array<{ ref: string; label: string; href?: string | null }>;
  witness_refs?: string[];
  witness_labels?: Array<{ ref: string; label: string }>;
  future_matches?: Array<{ future_id: string; criterion_ids: string[]; strength: string }>;
  why?: string;
  origin?: string;
  status?: string;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function surface(node: HTMLElement): void {
  node.style.background = 'var(--glass)';
  node.style.border = '1px solid var(--line)';
  node.style.borderRadius = 'var(--radius-md)';
  node.style.boxShadow = 'var(--elev-1)';
}

function labelForRef(ref: string): string {
  const parts = ref.split(':');
  const kind = parts[1] || 'record';
  const pretty = kind.charAt(0).toUpperCase() + kind.slice(1);
  return pretty;
}

function formatScanHeader(lastRunAt: string | null | undefined): string {
  if (!lastRunAt) return 'Skills scan';
  const d = new Date(lastRunAt);
  if (!Number.isFinite(d.getTime())) return 'Skills scan';
  const when = d.toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Sydney'
  });
  return `Skills scan · ${when} · Ann read your hubs`;
}

/**
 * Skills scan panel — pending proposals with Keep / Edit / Bin.
 */
export function renderSkillsScanPanel(
  host: HTMLElement,
  model: CareerModel,
  options: {
    onChanged: () => void;
    onKept?: (achievementId: string) => void;
  }
): void {
  const panel = el('section', 'career-page__panel career-page__scan');
  surface(panel);
  host.append(panel);

  const head = el('div', 'career-page__section-head');
  const title = el('h2', 'career-page__heading', formatScanHeader(model.scan?.last_run_at));
  head.append(title);
  panel.append(head);

  const status = el('p', 'career-page__meta');
  panel.append(status);

  const list = el('div', 'career-scan__list');
  panel.append(list);

  const run = el('button', 'btn btn--secondary', 'Run scan now') as HTMLButtonElement;
  run.type = 'button';
  panel.append(run);

  async function load(): Promise<void> {
    status.textContent = 'Loading proposals…';
    try {
      const data = (await listScanProposals()) as {
        proposals?: ScanProposal[];
        pending_count?: number;
        next_scan_label?: string;
        scan_state?: { last_run_at?: string | null };
      };
      const proposals = data.proposals ?? [];
      if (data.scan_state?.last_run_at) {
        title.textContent = formatScanHeader(data.scan_state.last_run_at);
      }
      list.replaceChildren();
      if (!proposals.length) {
        status.textContent = `All sorted. Next scan ${data.next_scan_label ?? 'Sunday evening'}.`;
        return;
      }
      status.textContent = `${proposals.length} proposal${proposals.length === 1 ? '' : 's'} waiting.`;
      for (const proposal of proposals) {
        list.append(renderCard(proposal, model, {
          onBin: async () => {
            await binScanProposal(proposal.id);
            status.textContent = "Binned. Ann won't suggest this again.";
            await load();
          },
          onKeep: async (edited) => {
            const result = (await keepScanProposal(proposal.id, edited)) as {
              achievement?: { id: string };
            };
            const kept = el('p', 'career-scan__kept', 'Kept · on the river');
            list.replaceChildren(kept);
            options.onKept?.(result.achievement?.id ?? '');
            options.onChanged();
          }
        }));
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Could not load Skills scan.';
    }
  }

  run.addEventListener('click', () => {
    void (async () => {
      run.disabled = true;
      run.textContent = 'Scanning…';
      try {
        const result = (await runCareerScan()) as {
          skipped?: boolean;
          reason?: string;
          retry_after_seconds?: number;
          next_scan_label?: string;
        };
        if (result.skipped && result.reason === 'rate_limited') {
          status.textContent = `Slow down — try again in ${result.retry_after_seconds ?? 600}s.`;
        } else {
          await load();
        }
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Scan failed.';
      } finally {
        run.disabled = false;
        run.textContent = 'Run scan now';
      }
    })();
  });

  void load();
}

function renderCard(
  proposal: ScanProposal,
  model: CareerModel,
  handlers: {
    onKeep: (edited: { title?: string }) => Promise<void>;
    onBin: () => Promise<void>;
  }
): HTMLElement {
  const card = el('article', 'career-scan__card');
  let editing = false;

  const sources = el('div', 'career-scan__sources');
  for (const ref of proposal.source_refs ?? []) {
    const chip = el('span', 'career-scan__source-chip', `From ${labelForRef(ref)}`);
    sources.append(chip);
  }
  if (proposal.origin === 'you') {
    sources.append(el('span', 'career-scan__source-chip', 'You added'));
  }
  card.append(sources);

  const title = el('h3', 'career-scan__title', proposal.title);
  card.append(title);

  const tags = el('div', 'career-scan__tags');
  for (const code of proposal.apst ?? []) {
    tags.append(el('span', 'career-scan__apst', code));
  }
  for (const match of proposal.future_matches ?? []) {
    const future = model.futures.find((f) => f.id === match.future_id);
    if (!future) continue;
    const dot = el('a', 'career-scan__future-dot', future.title.split(' ').slice(0, 2).join(' '));
    dot.href = careerFutureRoute(future.id);
    tags.append(dot);
  }
  card.append(tags);

  if (proposal.why) card.append(el('p', 'career-page__meta', proposal.why));

  const star = el('details', 'career-scan__star');
  star.append(el('summary', null, 'STAR answer, drafted'));
  const starBody = el('div', 'career-scan__star-body');
  for (const key of ['situation', 'task', 'action', 'result'] as const) {
    const value = proposal.star?.[key];
    if (value) starBody.append(el('p', null, `${key}: ${value}`));
  }
  if (!starBody.childElementCount) starBody.append(el('p', 'career-page__meta', 'No STAR yet.'));
  star.append(starBody);
  card.append(star);

  if (proposal.witness_refs?.length) {
    const witnesses = el('div', 'career-scan__witnesses');
    for (const ref of proposal.witness_refs) {
      witnesses.append(el('span', 'career-scan__witness', labelForRef(ref)));
    }
    card.append(witnesses);
  }

  const actions = el('div', 'career-scan__actions');
  const keep = el('button', 'btn btn--primary', 'Keep') as HTMLButtonElement;
  keep.type = 'button';
  const edit = el('button', 'btn btn--secondary', 'Edit') as HTMLButtonElement;
  edit.type = 'button';
  const bin = el('button', 'btn btn--ghost', 'Bin') as HTMLButtonElement;
  bin.type = 'button';

  keep.addEventListener('click', () => {
    void (async () => {
      keep.disabled = true;
      try {
        await handlers.onKeep({ title: title.textContent || proposal.title });
      } catch {
        keep.disabled = false;
      }
    })();
  });
  edit.addEventListener('click', () => {
    editing = !editing;
    title.contentEditable = editing ? 'true' : 'false';
    if (editing) title.focus();
    edit.textContent = editing ? 'Done' : 'Edit';
  });
  bin.addEventListener('click', () => {
    void (async () => {
      bin.disabled = true;
      try {
        await handlers.onBin();
      } catch {
        bin.disabled = false;
      }
    })();
  });

  actions.append(keep, edit, bin);
  card.append(actions);
  return card;
}
