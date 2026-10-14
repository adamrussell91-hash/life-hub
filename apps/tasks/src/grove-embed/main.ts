/**
 * Home's Grove preview (`/tasks/grove.html`): this week's piece of the forest, no hub chrome.
 * The same forest as the Grove page, opened on the current week, with that week's animals out.
 * Home frames it in a link to the full forest, so this page takes no input.
 */
import '../../design-kit/tokens.css';
import './embed.css';
import { toHubDateKey } from '@/domain/queries';
import { loadForest } from '@/views/grove/forest/load';
import { weekOfDay, weekRange } from '@/views/grove/forest/history';
import type { ForestHandle, ForestState } from '@/views/grove/forest/scene';

let handle: ForestHandle | null = null, revision = 0, shownDay = '';

const short = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : one + 's'}`;

/** "Week 42 · 12 Oct – 18 Oct · 9 trees", or a kind line for a week with nothing finished yet. */
export function weekLine(state: Pick<ForestState, 'week' | 'from' | 'to' | 'trees'>): string {
  if (state.week == null || !state.from || !state.to) return '';
  const range = `${short(state.from)} – ${short(state.to)}`;
  return `Week ${state.week} · ${range} · ${state.trees ? plural(state.trees, 'tree') : 'the clearing is ready'}`;
}

async function start(root: HTMLElement): Promise<void> {
  const current = ++revision;
  const now = new Date();
  const today = toHubDateKey(now);
  const year = Number(today.slice(0, 4));
  const week = weekOfDay(today, year);
  const caption = root.querySelector<HTMLParagraphElement>('.grove-embed__caption') ?? document.createElement('p');
  caption.className = 'grove-embed__caption';

  let data;
  try {
    data = await loadForest(year, now);
  } catch (err) {
    if (current !== revision || handle) return;
    const status = Number((err as { status?: number })?.status);
    caption.textContent = status === 401 || status === 403 ? 'Sign in to Tasks to see your clearing' : 'The clearing could not load';
    root.replaceChildren(caption);
    root.dataset.state = 'error';
    return;
  }
  if (current !== revision) return;
  const stage = document.createElement('div');
  stage.className = 'grove-embed__stage';
  // Keep the current canvas visible while the replacement mounts at the same size.
  stage.style.visibility = 'hidden';
  root.append(stage);
  try {
    const { mountForest } = await import('@/views/grove/forest/scene');
    if (current !== revision) { stage.remove(); return; }
    const [from, to] = weekRange(week, year);
    caption.textContent = weekLine({ week, from, to, trees: data.history.filter((d) => d.week === week).length });
    const mounted = await mountForest(stage, { year, today: now, history: data.history, animals: data.animals, interactive: false, week, weekSpan: 22 });
    if (current !== revision) { mounted.dispose(); stage.remove(); return; }
    const previous = handle;
    handle = mounted;
    shownDay = today;
    stage.style.removeProperty('visibility');
    stage.dataset.state = 'ready';
    root.replaceChildren(stage, caption);
    previous?.dispose();
    root.dataset.state = 'ready';
  } catch (error) {
    stage.remove();
    if (current !== revision) return;
    console.error(error);
    if (handle) return;
    caption.textContent = 'The clearing could not draw on this device';
    root.replaceChildren(caption);
    root.dataset.state = 'error';
  }
}

const root = document.getElementById('grove');
if (root) void start(root);

window.addEventListener('pagehide', () => { revision++; handle?.dispose(); handle = null; });
window.addEventListener('pageshow', (event) => { if (event.persisted && root) void start(root); });

// Home can stay open across midnight: redraw when the day changes (not every minute; the forest
// is costly to rebuild, and its animals already move on their own).
const refreshDay = () => { if (root && !document.hidden && toHubDateKey(new Date()) !== shownDay && shownDay) void start(root); };
window.setInterval(refreshDay, 60000);
document.addEventListener('visibilitychange', refreshDay);
