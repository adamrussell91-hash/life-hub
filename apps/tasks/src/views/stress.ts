import type { StressFlag } from '@/schemas/stress';
import { tasksApi } from '@/services/client-api';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderLoadError } from '@/views/feedback';
import { createCollapsibleFilters } from '@/views/collapsible-filters';
import { createHubFilter, el } from '@/views/hub-kit';
import type { StressAgent } from '@/schemas/stress';
import type { IntuitiveScanMeta } from '@/domain/intuitive-scan';

let stressRoute: StressAgent | 'all' = 'all';

function kindLabel(kind: StressFlag['pattern_kind']): string {
  return kind === 'intuitive' ? 'judgment' : kind.replace(/_/g, ' ');
}

function formatScanWhen(iso: string): string {
  const day = formatDisplayDate(iso);
  const time = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(iso));
  return `${day} ${time}`;
}

function judgmentStatusText(meta: IntuitiveScanMeta | null): string {
  if (!meta) return 'Clare has not run a judgment pass yet.';
  const when = formatScanWhen(meta.ran_at);
  if (meta.skipped_ai) {
    return `Last look ${when} — no API key, so judgment was skipped.`;
  }
  if (meta.raised > 0) {
    const noun = meta.raised === 1 ? 'new judgment flag' : 'new judgment flags';
    return `Last look ${when} — ${meta.raised} ${noun}.`;
  }
  if (meta.judged > 0) {
    const noun = meta.judged === 1 ? 'compound pattern' : 'compound patterns';
    return `Last look ${when} — ${meta.judged} ${noun}, already routed.`;
  }
  return `Last look ${when} — nothing compound to raise.`;
}

function renderFlag(flag: StressFlag): HTMLElement {
  const row = el('article', 'stress-card');
  row.append(
    el('p', 'page-header__eyebrow', `${kindLabel(flag.pattern_kind)} · Clare → network`),
    el('p', 'stress-card__body', flag.pattern_description)
  );
  const meta = el('div', 'task-row__meta');
  for (const agent of flag.routed_to) {
    meta.append(el('span', 'chip chip--muted', agent));
  }
  meta.append(el('span', 'chip', formatDisplayDate(flag.created_at)));
  row.append(meta);
  if (flag.recurrence_note) {
    row.append(el('p', 'task-row__desc', flag.recurrence_note));
  }
  return row;
}

/** Read-only StressFlag trail — agents poll inboxes; Adam can inspect texture here. */
export async function renderStressView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Scanning pressure patterns…'));
  let scan: { raised: StressFlag[]; skipped: number; patterns: number } | null = null;
  let scanError: unknown = null;
  let flags: StressFlag[];
  let hammond: StressFlag[];
  let judgment: IntuitiveScanMeta | null = null;
  try {
    try {
      scan = await tasksApi.scanStressFlags();
    } catch (err) {
      scanError = err;
    }
    const [page, inbox] = await Promise.all([
      tasksApi.loadStressFlags(),
      tasksApi.listAgentInbox('General Hammond')
    ]);
    flags = page.flags;
    judgment = page.judgment;
    hammond = inbox;
  } catch (err) {
    renderLoadError(
      canvas,
      err,
      () => void renderStressView(canvas),
      'Could not load StressFlags'
    );
    return;
  }

  canvas.replaceChildren();

  const agents = [...new Set(flags.flatMap((flag) => flag.routed_to))].sort();
  const toolbar = createCollapsibleFilters({
    id: 'stress',
    ariaLabel: 'Filters',
    active: stressRoute !== 'all'
  });
  toolbar.panel.append(
    createHubFilter({
      key: 'Routed to',
      label: 'Routed to',
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'All agents' },
        ...agents.map((agent) => ({ value: agent, label: agent }))
      ],
      value: stressRoute,
      onChange: (value) => {
        stressRoute = value as StressAgent | 'all';
        void renderStressView(canvas);
      }
    }).el
  );
  canvas.append(toolbar.root);

  const status = el('p', 'stress-scan-status');
  if (scanError) {
    status.textContent = `Scan failed: ${scanError instanceof Error ? scanError.message : 'Request failed'}`;
  } else if (scan && scan.raised.length > 0) {
    status.textContent = `Rule scan raised ${scan.raised.length} new flag(s); ${scan.skipped} already known.`;
  } else if (scan && scan.patterns > 0) {
    status.textContent = `Rule scan found ${scan.patterns} pattern(s); all already routed.`;
  } else {
    status.textContent = 'No rule-based pressure patterns right now.';
  }
  canvas.append(status);

  const judgeStatus = el('p', 'stress-scan-status');
  judgeStatus.textContent = judgmentStatusText(judgment);
  canvas.append(judgeStatus);

  const actions = el('div', 'stress-scan-actions');
  const rescan = el('button', 'btn btn--secondary', 'Scan rules');
  rescan.type = 'button';
  rescan.addEventListener('click', () => void renderStressView(canvas));
  const look = el('button', 'btn btn--primary', 'Look with judgment');
  look.type = 'button';
  look.addEventListener('click', async () => {
    look.disabled = true;
    rescan.disabled = true;
    judgeStatus.textContent = 'Clare is looking at the week…';
    try {
      const result = await tasksApi.scanIntuitiveFlags();
      if (result.skipped_ai) {
        judgeStatus.textContent =
          result.reason === 'no_api_key'
            ? 'Judgment needs ANTHROPIC_API_KEY on the API host — nothing rewritten.'
            : `Judgment skipped: ${result.reason ?? 'unavailable'}.`;
        look.disabled = false;
        rescan.disabled = false;
        return;
      }
      await renderStressView(canvas);
    } catch (err) {
      judgeStatus.textContent = `Judgment failed: ${err instanceof Error ? err.message : 'Request failed'}`;
      look.disabled = false;
      rescan.disabled = false;
    }
  });
  actions.append(rescan, look);
  canvas.append(actions);

  canvas.append(el('h2', 'section-title', 'Open flags'));
  const stack = el('div', 'task-stack');
  let visibleFlags = flags;
  if (stressRoute !== 'all') {
    const agent = stressRoute;
    visibleFlags = flags.filter((flag) => flag.routed_to.includes(agent));
  }
  if (!visibleFlags.length) {
    stack.append(el('p', 'empty-state', flags.length ? 'No flags for that agent.' : 'No StressFlags yet.'));
  } else {
    for (const flag of [...visibleFlags].reverse()) {
      stack.append(renderFlag(flag));
    }
  }
  canvas.append(stack);

  canvas.append(el('h2', 'section-title', 'General Hammond inbox'));
  const inbox = el('div', 'task-stack');
  if (!hammond.length) {
    inbox.append(el('p', 'empty-state', 'Inbox empty.'));
  } else {
    for (const flag of [...hammond].reverse().slice(0, 10)) {
      inbox.append(renderFlag(flag));
    }
  }
  canvas.append(inbox);
}
