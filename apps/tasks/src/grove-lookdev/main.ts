/**
 * Grove look prototype: the forest on synthetic history, for look rounds and screenshots.
 * Open /grove-lookdev.html on the Tasks dev server. The real Grove page mounts the same scene.
 */
import { mountForest } from '@/views/grove/forest/scene';
import { syntheticAnimals, syntheticHistory, TODAY } from './history';

const stage = document.getElementById('stage')!;
const title = document.getElementById('title')!;
const back = document.getElementById('back') as HTMLButtonElement;
const status = document.getElementById('status')!;
const fmt = (d: Date) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const forest = await mountForest(stage, {
  year: 2026,
  today: TODAY,
  history: syntheticHistory(),
  animals: syntheticAnimals(),
  topInset: () => title.getBoundingClientRect().bottom - stage.getBoundingClientRect().top + 8,
  onChange: (s) => {
    back.hidden = s.week == null;
    title.innerHTML = s.week == null
      ? `<strong>${s.year}</strong> <span>· ${s.trees} trees · ${s.builtWeeks} weeks</span>`
      : `<strong>Week ${s.week}</strong> <span>· ${fmt(s.from!)} to ${fmt(s.to!)} · ${s.future ? 'still to come' : s.trees === 1 ? '1 tree' : `${s.trees} trees`}</span>`;
  },
  onPick: (pick) => { status.textContent = pick?.kind === 'tree' ? `${pick.title} · finished ${fmt(pick.completed)}` : ''; }
});
back.addEventListener('click', () => forest.showYear());
(window as any).groveExpand = (week: number) => forest.expand(week);
(window as any).groveYear = () => forest.showYear();
(window as any).groveForest = forest;
document.body.dataset.models = 'true';
