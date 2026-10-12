/**
 * Home's Grove preview (`/tasks/grove.html`): today's clearing, no hub chrome.
 * Home frames it in a link to the full forest, so this page takes no input.
 */
import '../../design-kit/tokens.css';
import './embed.css';
import {groveBooks} from '@/domain/grove/books';
import {AnnualGroveLoader} from '@/domain/grove/annual-loader';
import {groveTerms} from '@/domain/grove/calendar';
import {toHubDateKey} from '@/domain/queries';
import {tasksApi} from '@/services/client-api';
import {dayCaption} from '@/views/grove/copy';
import type {GroveSceneHandle} from '@/views/grove/scene';

const loader=new AnnualGroveLoader();let handle:GroveSceneHandle|null=null,revision=0;
let acceptedBooks: Awaited<ReturnType<typeof groveBooks>> = [];
async function start(root: HTMLElement): Promise<void> {
  const current=++revision;loader.cancel();
  const calendar = Promise.all([tasksApi.getHubPrefs().catch(() => null),tasksApi.getPlanningProfile().catch(() => null), groveBooks().catch(() => acceptedBooks)]);
  const stage = document.createElement('div');
  stage.className = 'grove-embed__stage';
  const caption = document.createElement('p');
  caption.className = 'grove-embed__caption';
  if (!handle) root.replaceChildren(stage, caption);

  let tasks;
  try {
    tasks = await tasksApi.listTasks({includeCachedOnly:false});
  } catch (err) {
    if (current !== revision || handle) return;
    const status = Number((err as { status?: number })?.status);
    caption.textContent = status === 401 || status === 403 ? 'Sign in to Tasks to see your clearing' : 'The clearing could not load';
    root.dataset.state = 'error';
    return;
  }
  if(current!==revision)return;
  const [hubPrefs, planningProfile, books] = await calendar;
  const now = new Date();
  if(current!==revision)return;
  try{const loaded=await loader.load({ tasks, view: 'day', anchor: toHubDateKey(now), now, terms:groveTerms({hubPrefs,planningProfile}), books });
  if(current!==revision)return;const plan=loaded.plan;
  caption.textContent = dayCaption(plan);
    const { mountAnnualGroveScene } = await import('@/views/grove/annual-scene');
    if(current!==revision)return;
    // Keep the current canvas visible while the replacement mounts at the same size.
    stage.style.visibility = 'hidden';
    root.append(stage);
    const mounted=await mountAnnualGroveScene(stage, {
      ...loaded,
      interactive: false,
      frameMode: 'clearing'
    });
    if(current!==revision){mounted.dispose();stage.remove();return;}
    acceptedBooks = books;
    const previous = handle; handle = mounted;
    stage.style.removeProperty('visibility');
    root.replaceChildren(stage, caption);
    previous?.dispose(); root.dataset.state = 'ready';
  } catch (error) {
    stage.remove();
    if(current!==revision)return;console.error(error);
    if(handle)return;
    root.replaceChildren(stage,caption);
    caption.textContent = 'The clearing could not draw on this device';
    root.dataset.state = 'error';
  }
}

const root = document.getElementById('grove');
if (root) void start(root);

window.addEventListener('pagehide',()=>{revision++;loader.cancel();handle?.dispose();handle=null;});
window.addEventListener('pageshow',event=>{if(event.persisted&&root)void start(root);});

// The Home clearing can remain open across midnight or a growth boundary.
const refreshTime=()=>{if(root&&!document.hidden)void start(root);};
window.setInterval(refreshTime,60000);
document.addEventListener('visibilitychange',refreshTime);
