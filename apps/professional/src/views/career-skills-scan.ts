import {
  binScanProposal,
  estimateHistoryScan,
  historyScanStatus,
  keepScanProposal,
  listScanProposals,
  runCareerScan,
  startHistoryScan,
  stopHistoryScan,
  type HistoryMonths,
  type HistoryStatus
} from '@/api/career';
import { historyEstimateSentence } from '@/domain/career-application';
import { careerFutureRoute } from '@/app/router';
import type { CareerModel } from '@/domain/career-model';

type ScanProposal = {
  id: string;
  title: string;
  occurred_on?: string;
  date_precision?: string;
  star?: { situation?: string | null; task?: string | null; action?: string | null; result?: string | null };
  skills?: string[];
  apst?: string[];
  source_refs?: string[];
  source_labels?: Array<{ ref: string; label: string | null; href?: string | null }>;
  witness_refs?: string[];
  witness_labels?: Array<{ ref: string; label: string | null; href?: string | null }>;
  future_matches?: Array<{ future_id: string; criterion_ids: string[]; strength: string }>;
  why?: string;
  origin?: string;
  status?: string;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string | null,
  text?: string | null
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
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

/** Plain names for the record kinds the scan reads, in the order the panel lists them. */
const KIND_LABELS: Array<[string, string]> = [
  ['professional:meeting', 'meetings'],
  ['professional:event', 'PD and events'],
  ['professional:communication', 'communications'],
  ['tasks:task', 'tasks'],
  ['tasks:project', 'projects'],
  ['tasks:goal', 'goals'],
  ['teaching:unit', 'units'],
  ['teaching:lesson', 'lessons'],
  ['knowledge:page', 'Knowledge pages']
];

/** "Read: meetings, tasks, lessons." so a source the scan missed shows. */
export function readKindsLine(kinds: string[] | null | undefined): string {
  if (!Array.isArray(kinds)) return '';
  if (!kinds.length) return 'Read: nothing on the last run.';
  const known = KIND_LABELS.filter(([kind]) => kinds.includes(kind)).map(([, label]) => label);
  const other = kinds.filter((kind) => !KIND_LABELS.some(([k]) => k === kind));
  const labels = [...known, ...other.map((kind) => kind.split(':').pop() || kind)];
  return `Read: ${labels.join(', ')}.`;
}

export function historyProgressLine(status: HistoryStatus): string {
  const added = status.proposals_added ?? 0;
  const proposals = added === 1 ? '1 new proposal' : `${added} new proposals`;
  if (status.status === 'running') {
    const at = Math.min(status.batches, Math.max(1, status.batch + 1));
    return `Batch ${at} of ${status.batches}${added ? ` · ${proposals} so far` : ''}.`;
  }
  if (status.status === 'done') return `History scan finished: ${proposals}.`;
  if (status.status === 'stopped') return `Stopped after batch ${status.batch} of ${status.batches}: ${proposals}.`;
  if (status.status === 'failed') {
    return `${status.message || 'The history scan stopped.'} Batches already read are saved (${proposals}).`;
  }
  return '';
}

const HISTORY_WINDOWS: Array<[HistoryMonths, string]> = [
  [6, '6 months'],
  [12, '1 year'],
  [24, '2 years'],
  [36, '3 years']
];
const HISTORY_POLL_MS = 3000;

/** One poll for the whole page, however many times the panel redraws. */
let historyPoll: Promise<HistoryStatus> | null = null;
const historyListeners = new Set<(status: HistoryStatus) => void>();

function pollHistory(pollMs = HISTORY_POLL_MS): Promise<HistoryStatus> {
  if (historyPoll) return historyPoll;
  historyPoll = (async () => {
    // No clock: a history scan can take a while, and a dropped ask says nothing about it.
    for (;;) {
      let status: HistoryStatus | null = null;
      try {
        status = await historyScanStatus();
      } catch {
        status = null;
      }
      if (status) for (const listener of historyListeners) listener(status);
      if (status && status.status !== 'running') return status;
      if (!historyListeners.size) return status ?? { status: 'idle', batch: 0, batches: 0 };
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  })().finally(() => {
    historyPoll = null;
  });
  return historyPoll;
}

function historyBlock(onFinished: () => void): HTMLElement {
  const block = el('div', 'career-scan__history');
  block.append(el('h3', 'career-scan__title', 'Scan my history'));
  block.append(
    el('p', 'career-page__meta', 'Ann reads older records in batches and adds what she finds to the queue above.')
  );
  const controls = el('div', 'career-scan__actions');
  const pick = el('select', 'career-scan__window') as HTMLSelectElement;
  pick.setAttribute('aria-label', 'How far back');
  for (const [months, label] of HISTORY_WINDOWS) {
    const option = el('option', null, label) as HTMLOptionElement;
    option.value = String(months);
    pick.append(option);
  }
  pick.value = '12';
  const count = el('button', 'btn btn--secondary', 'Count records') as HTMLButtonElement;
  count.type = 'button';
  controls.append(pick, count);

  const confirm = el('div', 'career-scan__confirm');
  confirm.hidden = true;
  const sentence = el('p', 'career-page__meta');
  const go = el('button', 'btn btn--primary', 'Go') as HTMLButtonElement;
  go.type = 'button';
  const cancel = el('button', 'btn btn--ghost', 'Cancel') as HTMLButtonElement;
  cancel.type = 'button';
  const confirmActions = el('div', 'career-scan__actions');
  confirmActions.append(go, cancel);
  confirm.append(sentence, confirmActions);

  const progress = el('div', 'career-scan__confirm');
  progress.hidden = true;
  const progressLine = el('p', 'career-page__meta');
  progressLine.setAttribute('role', 'status');
  const stop = el('button', 'btn btn--ghost', 'Stop') as HTMLButtonElement;
  stop.type = 'button';
  const progressActions = el('div', 'career-scan__actions');
  progressActions.append(stop);
  progress.append(progressLine, progressActions);

  const note = el('p', 'career-page__meta');
  note.setAttribute('role', 'status');
  note.hidden = true;
  block.append(controls, confirm, progress, note);

  const show = (status: HistoryStatus) => {
    const running = status.status === 'running';
    progress.hidden = !running;
    controls.hidden = running;
    if (running) {
      confirm.hidden = true;
      progressLine.textContent = historyProgressLine(status);
      note.hidden = true;
    } else {
      note.textContent = historyProgressLine(status);
      note.hidden = !note.textContent;
    }
  };
  // A panel that was on the page and has gone (a redraw) stops listening.
  const listener = (status: HistoryStatus) => {
    if (block.isConnected) block.dataset.seen = '1';
    else if (block.dataset.seen) {
      historyListeners.delete(listener);
      return;
    }
    show(status);
  };
  const follow = () => {
    historyListeners.add(listener);
    void pollHistory().then((final) => {
      historyListeners.delete(listener);
      if (final.status !== 'idle' && final.status !== 'running') onFinished();
    });
  };

  count.addEventListener('click', () => {
    void (async () => {
      count.disabled = true;
      note.hidden = true;
      try {
        const months = Number(pick.value) as HistoryMonths;
        const estimate = await estimateHistoryScan(months);
        sentence.textContent = historyEstimateSentence(estimate);
        go.hidden = !estimate.sources;
        confirm.hidden = false;
        go.dataset.months = String(months);
      } catch (error) {
        note.textContent = error instanceof Error ? error.message : 'Could not count records. Try again.';
        note.hidden = false;
      } finally {
        count.disabled = false;
      }
    })();
  });
  cancel.addEventListener('click', () => {
    confirm.hidden = true;
  });
  go.addEventListener('click', () => {
    void (async () => {
      go.disabled = true;
      try {
        const status = await startHistoryScan(Number(go.dataset.months) as HistoryMonths);
        confirm.hidden = true;
        show(status);
        follow();
      } catch (error) {
        note.textContent = error instanceof Error ? error.message : 'Could not start the history scan.';
        note.hidden = false;
      } finally {
        go.disabled = false;
      }
    })();
  });
  stop.addEventListener('click', () => {
    void (async () => {
      stop.disabled = true;
      try {
        const status = await stopHistoryScan();
        progressLine.textContent =
          status.status === 'running' ? 'Stopping after this batch…' : historyProgressLine(status);
      } catch {
        progressLine.textContent = 'Could not stop it. Try again.';
      } finally {
        stop.disabled = false;
      }
    })();
  });

  // A scan already running (started before a reload) shows its progress straight away.
  void historyScanStatus().then(
    (status) => {
      if (status.status === 'running') {
        show(status);
        follow();
      }
    },
    () => {}
  );
  return block;
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
  const readLine = el('p', 'career-page__meta career-scan__read');
  readLine.hidden = true;
  panel.append(readLine);

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
        scan_state?: { last_run_at?: string | null; read_kinds?: string[] };
        read_kinds?: string[];
      };
      readLine.textContent = readKindsLine(data.read_kinds ?? data.scan_state?.read_kinds);
      readLine.hidden = !readLine.textContent;
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

  panel.append(historyBlock(() => void load()));

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
    const resolved = proposal.source_labels?.find((entry) => entry.ref === ref);
    const text = resolved?.label
      ? `From ${labelForRef(ref)} · ${resolved.label}`
      : `From ${labelForRef(ref)}`;
    if (resolved?.href) {
      const link = el('a', 'career-scan__source-chip', text);
      link.href = resolved.href;
      sources.append(link);
    } else {
      sources.append(el('span', 'career-scan__source-chip', text));
    }
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
      const resolved = proposal.witness_labels?.find((entry) => entry.ref === ref);
      witnesses.append(el('span', 'career-scan__witness', resolved?.label || labelForRef(ref)));
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
