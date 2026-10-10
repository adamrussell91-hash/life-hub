/**
 * Home's Grove preview (`/tasks/grove.html`): today's clearing, no hub chrome.
 * Home frames it in a link to the full forest, so this page takes no input.
 */
import '../../design-kit/tokens.css';
import './embed.css';
import { buildGrovePlan } from '@/domain/grove/plan';
import { toHubDateKey } from '@/domain/queries';
import { tasksApi } from '@/services/client-api';
import { dayCaption } from '@/views/grove/copy';

async function start(root: HTMLElement): Promise<void> {
  const stage = document.createElement('div');
  stage.className = 'grove-embed__stage';
  const caption = document.createElement('p');
  caption.className = 'grove-embed__caption';
  root.append(stage, caption);

  let tasks;
  try {
    tasks = await tasksApi.listTasks();
  } catch (err) {
    const status = Number((err as { status?: number })?.status);
    caption.textContent = status === 401 || status === 403 ? 'Sign in to Tasks to see your clearing' : 'The clearing could not load';
    root.dataset.state = 'error';
    return;
  }
  const now = new Date();
  const plan = buildGrovePlan({ tasks, view: 'day', anchor: toHubDateKey(now), now });
  caption.textContent = dayCaption(plan);
  try {
    const { mountGroveScene } = await import('@/views/grove/scene');
    await mountGroveScene(stage, {
      plan,
      interactive: false,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      wobble: 'all'
    });
    root.dataset.state = 'ready';
  } catch (error) {
    console.error(error);
    caption.textContent = 'The clearing could not draw on this device';
    root.dataset.state = 'error';
  }
}

const root = document.getElementById('grove');
if (root) void start(root);
