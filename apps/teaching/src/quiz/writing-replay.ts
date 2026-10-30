import { button, el } from '@/quiz/dom';
import { replayText, writingLine, type WritingLog, type WritingSummary } from '@/quiz/writing';

/** Longest pause the replay sits through; longer ones are skipped and named. */
const MAX_PAUSE_MS = 1500;
const SPEEDS = [1, 4, 16] as const;

/**
 * The teacher's look at how one written answer was typed: the counts, any
 * flags in plain words, and a replay that rebuilds the answer change by
 * change. Folded typing runs play out letter by letter, so a draft reads as
 * it was written.
 */
export function writingPanel(summary: WritingSummary, log: WritingLog | undefined, handedIn: string): HTMLElement {
  const wrap = el('div', 'qz-writing');
  const line = el('p', 'qz-writing__line', writingLine(summary));
  wrap.append(line);
  if (summary.flags.length) {
    wrap.dataset.flagged = 'true';
    const flags = el('ul', 'qz-writing__flags');
    for (const f of summary.flags) flags.append(el('li', 'qz-writing__flag', f));
    wrap.append(flags);
  }
  if (!log?.steps.length) return wrap;
  const host = el('div', 'qz-writing__replay');
  host.hidden = true;
  const open = button('Watch it being written', 'ghost', () => {
    host.hidden = !host.hidden;
    open.textContent = host.hidden ? 'Watch it being written' : 'Hide the replay';
    if (!host.hidden && !host.childElementCount) host.append(replay(log, handedIn));
  });
  open.setAttribute('aria-expanded', 'false');
  open.addEventListener('click', () => open.setAttribute('aria-expanded', String(!host.hidden)));
  wrap.append(open, host);
  return wrap;
}

/** One frame per letter typed in a run, one per other change. */
type Frame = { text: string; t: number; pause: number };

function frames(log: WritingLog): Frame[] {
  const out: Frame[] = [{ text: log.base, t: 0, pause: 0 }];
  let text = log.base;
  let lastT = log.steps[0]?.[0] ?? 0;
  for (const [t, at, cut, put] of log.steps) {
    const gap = (t - lastT) * 100;
    lastT = t;
    const typedRun = cut === 0 && put.length > 1 && put.length < 40;
    if (typedRun) {
      for (let i = 1; i <= put.length; i += 1) out.push({ text: text.slice(0, at) + put.slice(0, i) + text.slice(at), t, pause: i === 1 ? gap : 0 });
      text = text.slice(0, at) + put + text.slice(at);
    } else {
      text = text.slice(0, at) + put + text.slice(at + cut);
      out.push({ text, t, pause: gap });
    }
  }
  return out;
}

const clock = (tenths: number): string => {
  const s = Math.round(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function replay(log: WritingLog, handedIn: string): HTMLElement {
  const list = frames(log);
  const wrap = el('div', 'qz-replay');
  const page = el('div', 'qz-replay__page');
  page.setAttribute('aria-live', 'off');
  const status = el('p', 'qz-replay__status');
  const scrub = el('input', 'qz-replay__scrub');
  scrub.type = 'range';
  scrub.min = '0';
  scrub.max = String(list.length - 1);
  scrub.value = '0';
  scrub.setAttribute('aria-label', 'Replay position');
  let at = 0;
  let speed: (typeof SPEEDS)[number] = 4;
  let timer: number | undefined;

  const show = (i: number, skipped = 0): void => {
    at = i;
    const f = list[i] as Frame;
    page.textContent = f.text;
    scrub.value = String(i);
    status.textContent = `${clock(f.t)} into writing${skipped > 0 ? ` · skipped a ${Math.round(skipped / 60_000) >= 1 ? `${Math.round(skipped / 60_000)} min` : `${Math.round(skipped / 1000)} s`} pause` : ''}`;
  };

  const play = (): void => {
    window.clearTimeout(timer);
    if (at >= list.length - 1) {
      playBtn.textContent = 'Play again';
      return;
    }
    const next = list[at + 1] as Frame;
    const wait = Math.min(next.pause, MAX_PAUSE_MS) / speed + 40 / speed;
    timer = window.setTimeout(() => {
      if (!wrap.isConnected) return;
      show(at + 1, next.pause > MAX_PAUSE_MS ? next.pause : 0);
      play();
    }, wait);
  };
  const playing = () => timer !== undefined;
  const stop = (): void => {
    window.clearTimeout(timer);
    timer = undefined;
    playBtn.textContent = 'Play';
  };
  const playBtn = button('Play', 'secondary', () => {
    if (playing()) return stop();
    if (at >= list.length - 1) show(0);
    playBtn.textContent = 'Pause';
    play();
  });
  const speedBtn = button(`${speed}×`, 'ghost', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] as (typeof SPEEDS)[number];
    speedBtn.textContent = `${speed}×`;
  });
  speedBtn.setAttribute('aria-label', 'Replay speed');
  scrub.addEventListener('input', () => {
    stop();
    show(Number(scrub.value));
  });

  const controls = el('div', 'qz-replay__controls');
  controls.append(playBtn, speedBtn, scrub);
  wrap.append(controls, page, status);
  if (log.base) wrap.append(el('p', 'qz-note block-secondary', 'Some text was already there when recording began, so the replay starts from it.'));
  if (log.full) wrap.append(el('p', 'qz-note block-secondary', 'The replay hit its size limit partway through, so it stops early. The counts above cover the whole answer.'));
  else if (replayText(log) !== handedIn) wrap.append(el('p', 'qz-note block-secondary', 'The replay doesn’t end on the handed-in text, so part of the writing wasn’t recorded (another device, or an old browser).'));
  show(0);
  return wrap;
}
