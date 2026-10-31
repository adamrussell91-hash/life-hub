/**
 * The tools inside the classroom toolbox. Each builder paints into `root` and
 * may return a stop function, called when the tool closes.
 */
import type { Block, ClassroomToolId, TimerSegment } from '@/schemas/block';
import type { Class } from '@/schemas/class';
import {
  addMinute,
  allNames,
  defaultClassId,
  formatClock,
  formatStopwatch,
  isoDay,
  makeGroups,
  numberChoices,
  pickableNames,
  randomIndex,
  skipTimer,
  stackTotalMinutes,
  startTimerRun,
  TIMER_PRESETS,
  tickTimerRun,
  timerProgress,
  type TimerRun
} from '@/blocks/classroom-tools/logic';
import { chime, primeSound } from '@/blocks/classroom-tools/sound';
import { ICON } from '@/blocks/classroom-tools/icons';
import { spinnerTechniques } from '@/blocks/technique-scan';
import { familyOfTechnique, loadLiteraryElements, type LiteraryTechnique } from '@/blocks/literary-elements';

export type ToolEnv = {
  viewer: 'teacher' | 'student';
  timerStack: TimerSegment[];
  lessonId?: string;
  pageBlocks?: Block[];
  uid: string;
};

type Builder = (root: HTMLElement, env: ToolEnv) => (() => void) | void;

const SEGMENT_TINTS = ['var(--wave)', 'var(--high-sea)', 'var(--success)', 'var(--pastel-lilac-ink, var(--navy))', 'var(--pastel-gold-ink, var(--marine))'];
const GROUP_TINTS = ['sage', 'peach', 'lilac', 'gold', 'blue'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Kit .btn: the go action is primary (navy), the rest secondary. ct-btn classes are layout hooks only. */
function btn(label: string, className = 'ct-btn'): HTMLButtonElement {
  const variant = className.includes('ct-btn--go') ? 'btn--primary' : 'btn--secondary';
  const b = el('button', `btn ${variant} ${className}`, label);
  b.type = 'button';
  return b;
}

function numberInput(id: string, value: number, label: string, min?: number, max?: number): HTMLInputElement {
  const input = el('input', 'ct-num');
  input.type = 'number';
  input.id = id;
  input.value = String(value);
  input.setAttribute('aria-label', label);
  if (min !== undefined) input.min = String(min);
  if (max !== undefined) input.max = String(max);
  input.inputMode = 'numeric';
  return input;
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = el('label', 'ct-inline');
  label.append(el('span', '', text), control);
  return label;
}

function checkbox(id: string, text: string, checked: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
  const input = el('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = checked;
  const label = el('label', 'ct-inline');
  label.append(input, el('span', '', text));
  return { label, input };
}

function row(...nodes: HTMLElement[]): HTMLDivElement {
  const r = el('div', 'ct-row');
  r.append(...nodes);
  return r;
}

const reducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Flick through `frames` options, slowing down, then land on `land`. */
function spin(steps: number, onFrame: () => void, onLand: () => void): () => void {
  if (reducedMotion()) {
    onLand();
    return () => undefined;
  }
  let k = 0;
  let timer = 0;
  const step = () => {
    onFrame();
    k += 1;
    if (k < steps) timer = window.setTimeout(step, 40 + k * k * 1.6);
    else onLand();
  };
  step();
  return () => window.clearTimeout(timer);
}

// ---------------------------------------------------------------- timer

const timerTool: Builder = (root, env) => {
  let run: TimerRun = startTimerRun(env.timerStack);
  let raf = 0;
  let last = 0;

  const now = el('p', 'ct-sub');
  const clock = el('div', 'ct-big ct-big--time');
  clock.setAttribute('role', 'timer');
  const bar = el('div', 'ct-bar-segs');
  bar.setAttribute('aria-hidden', 'true');
  const go = btn('Start', 'ct-btn ct-btn--go');
  const next = btn('Next');
  const reset = btn('Reset');
  const plus = btn('+1 min');
  const stackHost = el('div', 'ct-stack');
  const total = el('span', 'ct-sub ct-sub--end');
  const add = btn('+ Add a timer', 'ct-btn ct-btn--sm');

  root.append(now, clock, bar, row(go, next, reset, plus));

  if (env.viewer === 'teacher') {
    const presets = el('div', 'ct-presets');
    presets.append(el('span', 'ct-inline', 'Presets'));
    for (const preset of TIMER_PRESETS) {
      const chip = btn(preset.label, 'ct-chip ct-chip--sm');
      chip.addEventListener('click', () => {
        stop();
        run = startTimerRun(preset.stack);
        paintAll();
      });
      presets.append(chip);
    }
    root.append(presets);
  }
  root.append(stackHost, row(add, total));
  const note = el('p', 'ct-note', env.viewer === 'teacher'
    ? 'Changes here last until you close the timer. Save a stack for this lesson in the block settings.'
    : 'This is your own copy of the timer.');
  root.append(note);

  function stop(): void {
    cancelAnimationFrame(raf);
    run = { ...run, running: false };
  }

  function paintNow(): void {
    const seg = run.stack[run.index];
    const following = run.stack[run.index + 1];
    now.replaceChildren();
    if (run.done) {
      now.append(el('strong', '', 'All done'));
    } else {
      now.append(el('strong', '', seg.label));
      if (following) now.append(document.createTextNode(` · then ${following.label}`));
    }
    clock.textContent = formatClock(run.done ? 0 : run.left);
    go.textContent = run.running ? 'Pause' : run.done ? 'Again' : 'Start';
  }

  function paintBar(): void {
    const progress = timerProgress(run);
    if (bar.children.length !== run.stack.length) {
      bar.replaceChildren(
        ...run.stack.map((seg, i) => {
          const part = el('div', 'ct-bar-seg');
          part.style.flexGrow = String(seg.minutes);
          part.style.setProperty('--sc', SEGMENT_TINTS[i % SEGMENT_TINTS.length]);
          part.append(el('div', 'ct-bar-fill'));
          return part;
        })
      );
    }
    [...bar.children].forEach((part, i) => {
      (part.firstElementChild as HTMLElement).style.width = `${progress[i] * 100}%`;
    });
  }

  function paintStack(): void {
    stackHost.replaceChildren(
      ...run.stack.map((seg, i) => {
        const line = el('div', 'ct-seg');
        if (i === run.index && !run.done) line.classList.add('is-now');
        if (i < run.index || run.done) line.classList.add('is-done');
        line.style.setProperty('--sc', SEGMENT_TINTS[i % SEGMENT_TINTS.length]);
        const dot = el('span', 'ct-seg__dot');
        const name = el('input', 'ct-seg__name');
        name.type = 'text';
        name.id = `ct-seg-${env.uid}-${i}`;
        name.value = seg.label;
        name.maxLength = 60;
        name.setAttribute('aria-label', `Timer ${i + 1} name`);
        name.addEventListener('input', () => {
          run.stack[i] = { ...run.stack[i], label: name.value || 'Timer' };
          paintNow();
        });
        const mins = numberInput(`ct-seg-m-${env.uid}-${i}`, seg.minutes, `Timer ${i + 1} minutes`, 0.5, 180);
        mins.step = '0.5';
        mins.addEventListener('change', () => {
          const value = Math.min(180, Math.max(0.5, Number(mins.value) || 1));
          run.stack[i] = { ...run.stack[i], minutes: value };
          if (i === run.index && !run.running) run = { ...run, left: value * 60_000 };
          paintAll();
        });
        const remove = el('button', 'ct-icon-btn');
        remove.type = 'button';
        remove.innerHTML = ICON.trash;
        remove.setAttribute('aria-label', `Remove ${seg.label}`);
        remove.disabled = run.stack.length < 2;
        remove.addEventListener('click', () => {
          stop();
          const stack = run.stack.filter((_, j) => j !== i);
          run = startTimerRun(stack);
          paintAll();
        });
        line.append(dot, name, labelled('min', mins), remove);
        return line;
      })
    );
    total.textContent = `${run.stack.length} ${run.stack.length === 1 ? 'timer' : 'timers'} · ${formatClock(stackTotalMinutes(run.stack) * 60_000)} total`;
    add.disabled = run.stack.length >= 8;
  }

  function paintAll(): void {
    paintNow();
    paintBar();
    paintStack();
  }

  function flash(): void {
    root.classList.remove('ct-flash');
    void root.offsetWidth;
    root.classList.add('ct-flash');
  }

  function frame(t: number): void {
    const result = tickTimerRun(run, t - last);
    last = t;
    run = result.run;
    if (result.finished) {
      chime(3);
      flash();
      paintAll();
      return;
    }
    if (result.changed) {
      chime(2);
      flash();
      paintStack();
    }
    paintNow();
    paintBar();
    raf = requestAnimationFrame(frame);
  }

  go.addEventListener('click', () => {
    primeSound();
    if (run.done) run = startTimerRun(run.stack);
    if (run.running) {
      stop();
    } else {
      run = { ...run, running: true };
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    paintAll();
  });
  next.addEventListener('click', () => {
    const wasRunning = run.running;
    run = skipTimer(run);
    if (run.done) stop();
    else if (wasRunning) run = { ...run, running: true };
    paintAll();
  });
  reset.addEventListener('click', () => {
    stop();
    run = startTimerRun(run.stack);
    paintAll();
  });
  plus.addEventListener('click', () => {
    run = addMinute(run);
    paintNow();
    paintBar();
  });
  add.addEventListener('click', () => {
    if (run.stack.length >= 8) return;
    const names = ['Share time', 'Think time', 'Pack up'];
    run = { ...run, stack: [...run.stack, { label: names[(run.stack.length - 1) % names.length], minutes: 3 }] };
    if (run.done) run = { ...run, done: false, index: run.stack.length - 1, left: 3 * 60_000 };
    paintAll();
  });

  paintAll();
  return stop;
};

// ---------------------------------------------------------------- stopwatch

const stopwatchTool: Builder = (root) => {
  let elapsed = 0;
  let running = false;
  let last = 0;
  let raf = 0;
  const laps: number[] = [];
  const clock = el('div', 'ct-big ct-big--time', formatStopwatch(0));
  clock.setAttribute('role', 'timer');
  const go = btn('Start', 'ct-btn ct-btn--go');
  const lap = btn('Lap');
  const reset = btn('Reset');
  const list = el('ol', 'ct-laps');
  root.append(clock, row(go, lap, reset), list);

  const frame = (t: number) => {
    if (!running) return;
    elapsed += t - last;
    last = t;
    clock.textContent = formatStopwatch(elapsed);
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  go.addEventListener('click', () => {
    if (running) stop();
    else {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    go.textContent = running ? 'Stop' : 'Start';
  });
  lap.addEventListener('click', () => {
    if (elapsed <= 0) return;
    laps.unshift(elapsed);
    list.replaceChildren(
      ...laps.map((value, i) => {
        const item = el('li');
        item.append(el('span', '', `Lap ${laps.length - i}`), el('span', '', formatStopwatch(value)));
        return item;
      })
    );
  });
  reset.addEventListener('click', () => {
    stop();
    elapsed = 0;
    laps.length = 0;
    list.replaceChildren();
    clock.textContent = formatStopwatch(0);
    go.textContent = 'Start';
  });
  return stop;
};

// ---------------------------------------------------------------- names

const LAST_CLASS_KEY = 'teaching-hub.classroom-tools.class';

function rememberedClass(lessonId?: string): string | null {
  try {
    return localStorage.getItem(`${LAST_CLASS_KEY}.${lessonId ?? 'any'}`);
  } catch {
    return null;
  }
}

function rememberClass(lessonId: string | undefined, classId: string): void {
  try {
    localStorage.setItem(`${LAST_CLASS_KEY}.${lessonId ?? 'any'}`, classId);
  } catch {
    // Not remembered on this device; the picker still works.
  }
}

export type ClassLists = { classes: Class[]; preferred: string | null };

/** Teacher side only: the class lists, read from the class records at run time. */
export async function loadClassLists(env: Pick<ToolEnv, 'lessonId'>): Promise<ClassLists> {
  const { getCurriculum } = await import('@/app/curriculum-state');
  const curriculum = await getCurriculum();
  const classes = curriculum.classes.filter((cls) => (cls.students?.length ?? 0) > 0);
  const scheduled = env.lessonId ? curriculum.scheduled_lessons.filter((row) => row.lesson_id === env.lessonId) : [];
  const preferred = defaultClassId(
    classes.map((cls) => cls.id),
    scheduled,
    isoDay(new Date()),
    rememberedClass(env.lessonId)
  );
  return { classes, preferred };
}

export function className(cls: Class): string {
  return cls.display_name?.trim() || cls.code;
}

function classSelect(env: ToolEnv, lists: ClassLists, onPick: (cls: Class) => void): HTMLLabelElement {
  const select = el('select', 'ct-select');
  select.id = `ct-class-${env.uid}`;
  for (const cls of lists.classes) {
    const option = el('option', '', className(cls));
    option.value = cls.id;
    select.append(option);
  }
  select.value = lists.preferred ?? lists.classes[0]?.id ?? '';
  select.addEventListener('change', () => {
    const cls = lists.classes.find((c) => c.id === select.value);
    if (!cls) return;
    rememberClass(env.lessonId, cls.id);
    onPick(cls);
  });
  return labelled('Class', select);
}

function noClassLists(root: HTMLElement): void {
  root.append(
    el('p', 'ct-empty', 'No class lists yet. Open a class page and add the students under Students. The name picker reads them from there.')
  );
}

function withClassLists(root: HTMLElement, env: ToolEnv, build: (lists: ClassLists) => void): void {
  const status = el('p', 'ct-sub', 'Loading class lists…');
  root.append(status);
  loadClassLists(env)
    .then((lists) => {
      status.remove();
      if (!lists.classes.length) noClassLists(root);
      else build(lists);
    })
    .catch(() => {
      status.textContent = 'The class lists did not load. Check your connection and open the tool again.';
    });
}

const namesTool: Builder = (root, env) => {
  let cancelSpin = () => undefined as void;
  withClassLists(root, env, (lists) => {
    let cls = lists.classes.find((c) => c.id === lists.preferred) ?? lists.classes[0];
    let pool: string[] = [];
    const picked: string[] = [];
    const out = el('div', 'ct-big ct-big--name', 'Ready');
    out.setAttribute('aria-live', 'polite');
    const left = el('p', 'ct-sub');
    const pick = btn('Pick a name', 'ct-btn ct-btn--go');
    const reset = btn('Put everyone back');
    const drop = checkbox(`ct-drop-${env.uid}`, "Don't pick the same person twice", true);
    const tags = el('div', 'ct-tags');

    const restart = () => {
      cancelSpin();
      pool = pickableNames(cls.students);
      picked.length = 0;
      out.textContent = 'Ready';
      out.classList.remove('is-rolling');
      paint();
    };
    // Counts never show a class total, so a skipped student can't be inferred.
    const paint = () => {
      left.textContent = drop.input.checked ? `${pool.length} still to go` : className(cls);
      tags.replaceChildren(...picked.map((name) => el('span', 'ct-tag', name)));
    };

    root.append(
      row(classSelect(env, lists, (next) => {
        cls = next;
        restart();
      })),
      out,
      left,
      row(pick, reset, drop.label),
      tags
    );

    pick.addEventListener('click', () => {
      primeSound();
      const source = drop.input.checked ? pool : pickableNames(cls.students);
      if (!source.length) {
        out.textContent = 'Everyone has had a go';
        return;
      }
      const winner = source[randomIndex(source.length)];
      out.classList.add('is-rolling');
      pick.disabled = true;
      cancelSpin = spin(
        16,
        () => {
          out.textContent = source[randomIndex(source.length)];
        },
        () => {
          out.textContent = winner;
          out.classList.remove('is-rolling');
          pick.disabled = false;
          chime(1);
          if (drop.input.checked) pool = pool.filter((name) => name !== winner);
          picked.push(winner);
          paint();
        }
      );
    });
    reset.addEventListener('click', restart);
    drop.input.addEventListener('change', paint);
    restart();
  });
  return () => cancelSpin();
};

// ---------------------------------------------------------------- groups

const groupsTool: Builder = (root, env) => {
  withClassLists(root, env, (lists) => {
    let cls = lists.classes.find((c) => c.id === lists.preferred) ?? lists.classes[0];
    const size = numberInput(`ct-size-${env.uid}`, 4, 'Students per group', 2, 8);
    const make = btn('Make groups', 'ct-btn ct-btn--go');
    const info = el('p', 'ct-sub');
    const out = el('div', 'ct-groups');
    const paint = () => {
      const names = allNames(cls.students);
      const groups = makeGroups(names, Number(size.value) || 4);
      info.textContent = `${groups.length} groups`;
      out.replaceChildren(
        ...groups.map((members, i) => {
          const box = el('div', `ct-group ct-tint--${GROUP_TINTS[i % GROUP_TINTS.length]}`);
          box.append(el('strong', '', `Group ${i + 1}`), ...members.map((name) => el('span', '', name)));
          return box;
        })
      );
    };
    root.append(
      row(
        classSelect(env, lists, (next) => {
          cls = next;
          paint();
        }),
        labelled('Groups of', size),
        make
      ),
      info,
      out
    );
    make.addEventListener('click', paint);
    paint();
  });
};

// ---------------------------------------------------------------- number

const numberTool: Builder = (root, env) => {
  const used = new Set<number>();
  const history: number[] = [];
  const out = el('div', 'ct-big ct-big--num', '?');
  out.setAttribute('aria-live', 'polite');
  const lo = numberInput(`ct-lo-${env.uid}`, 1, 'From');
  const hi = numberInput(`ct-hi-${env.uid}`, 30, 'To');
  const roll = btn('Roll', 'ct-btn ct-btn--go');
  const noRepeat = checkbox(`ct-norep-${env.uid}`, 'No repeats', false);
  const clear = btn('Clear', 'ct-btn ct-btn--sm');
  const past = el('p', 'ct-history', 'History appears here');
  let cancel = () => undefined as void;
  root.append(out, row(labelled('From', lo), labelled('to', hi), roll), row(noRepeat.label, clear), past);

  roll.addEventListener('click', () => {
    primeSound();
    const choices = numberChoices(Number(lo.value), Number(hi.value), used, noRepeat.input.checked);
    if (!choices.length) {
      out.textContent = '–';
      past.textContent = 'Every number has come up. Clear to start again.';
      return;
    }
    const all = numberChoices(Number(lo.value), Number(hi.value));
    const winner = choices[randomIndex(choices.length)];
    out.classList.add('is-rolling');
    roll.disabled = true;
    cancel = spin(
      14,
      () => {
        out.textContent = String(all[randomIndex(all.length)]);
      },
      () => {
        out.textContent = String(winner);
        out.classList.remove('is-rolling');
        roll.disabled = false;
        used.add(winner);
        history.unshift(winner);
        past.textContent = history.slice(0, 20).join('  ·  ');
        chime(1);
      }
    );
  });
  clear.addEventListener('click', () => {
    cancel();
    used.clear();
    history.length = 0;
    out.textContent = '?';
    past.textContent = 'History appears here';
    roll.disabled = false;
  });
  return () => cancel();
};

// ---------------------------------------------------------------- scores

const scoresTool: Builder = (root, env) => {
  const teams = [1, 2, 3].map((n) => ({ name: `Team ${n}`, points: 0 }));
  const board = el('div', 'ct-teams');
  const add = btn('+ Team', 'ct-btn ct-btn--sm');
  const remove = btn('− Team', 'ct-btn ct-btn--sm');
  const zero = btn('Reset scores', 'ct-btn ct-btn--sm');
  root.append(board, row(add, remove, zero));

  const paint = () => {
    const top = Math.max(...teams.map((t) => t.points));
    board.replaceChildren(
      ...teams.map((team, i) => {
        const card = el('div', `ct-team ct-tint--${GROUP_TINTS[i % GROUP_TINTS.length]}`);
        const name = el('input', 'ct-team__name');
        name.type = 'text';
        name.id = `ct-team-${env.uid}-${i}`;
        name.value = team.name;
        name.maxLength = 30;
        name.setAttribute('aria-label', `Team ${i + 1} name`);
        name.addEventListener('input', () => {
          team.name = name.value;
        });
        const pts = el('div', 'ct-team__pts', String(team.points));
        if (top > 0 && team.points === top) {
          card.classList.add('is-leading');
          pts.append(el('span', 'ct-team__lead', ' ★'));
        }
        const controls = el('div', 'ct-row');
        for (const delta of [-1, 1, 5]) {
          const b = btn(delta > 0 ? `+${delta}` : '−1', 'ct-btn ct-btn--sm');
          b.setAttribute('aria-label', delta > 0 ? `Give ${team.name || `team ${i + 1}`} ${delta}` : `Take a point from ${team.name || `team ${i + 1}`}`);
          b.addEventListener('click', () => {
            team.points = Math.max(0, team.points + delta);
            paint();
          });
          controls.append(b);
        }
        card.append(name, pts, controls);
        return card;
      })
    );
    add.disabled = teams.length >= 6;
    remove.disabled = teams.length <= 2;
  };
  add.addEventListener('click', () => {
    if (teams.length < 6) teams.push({ name: `Team ${teams.length + 1}`, points: 0 });
    paint();
  });
  remove.addEventListener('click', () => {
    if (teams.length > 2) teams.pop();
    paint();
  });
  zero.addEventListener('click', () => {
    for (const team of teams) team.points = 0;
    paint();
  });
  paint();
};

// ---------------------------------------------------------------- coin

const coinTool: Builder = (root) => {
  let heads = 0;
  let tails = 0;
  let timer = 0;
  const coin = el('div', 'ct-coin', 'Heads');
  coin.setAttribute('aria-live', 'polite');
  const tally = el('p', 'ct-sub', ' ');
  const flip = btn('Flip', 'ct-btn ct-btn--go');
  root.append(coin, tally, row(flip));
  flip.addEventListener('click', () => {
    primeSound();
    const isHeads = Math.random() < 0.5;
    coin.classList.remove('is-flipping');
    void coin.offsetWidth;
    if (!reducedMotion()) coin.classList.add('is-flipping');
    flip.disabled = true;
    timer = window.setTimeout(() => {
      coin.textContent = isHeads ? 'Heads' : 'Tails';
      if (isHeads) heads += 1;
      else tails += 1;
      tally.textContent = `Heads ${heads} · Tails ${tails}`;
      flip.disabled = false;
      chime(1);
    }, reducedMotion() ? 0 : 450);
  });
  return () => window.clearTimeout(timer);
};

// ---------------------------------------------------------------- dice

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

const diceTool: Builder = (root, env) => {
  const tray = el('div', 'ct-dice');
  const sum = el('p', 'ct-sub', ' ');
  const count = numberInput(`ct-dice-${env.uid}`, 2, 'Number of dice', 1, 4);
  const roll = btn('Roll', 'ct-btn ct-btn--go');
  root.append(tray, sum, row(labelled('Dice', count), roll));
  const draw = (values: number[], shake: boolean) => {
    tray.replaceChildren(
      ...values.map((value) => {
        const die = el('div', 'ct-die');
        if (shake && !reducedMotion()) die.classList.add('is-shaking');
        die.setAttribute('role', 'img');
        die.setAttribute('aria-label', String(value));
        for (let i = 0; i < 9; i += 1) die.append(el('i', PIPS[value].includes(i) ? 'is-on' : ''));
        return die;
      })
    );
    sum.textContent = values.length > 1 ? `Total ${values.reduce((a, b) => a + b, 0)}` : ' ';
  };
  roll.addEventListener('click', () => {
    primeSound();
    const n = Math.min(4, Math.max(1, Math.round(Number(count.value)) || 1));
    draw(Array.from({ length: n }, () => 1 + randomIndex(6)), true);
    chime(1);
  });
  draw([3, 5], false);
};

// ---------------------------------------------------------------- technique

/** Every leaf block on the page, inside sections, columns and tabs too. */
export function flattenBlocks(blocks: readonly Block[] | undefined): Block[] {
  const out: Block[] = [];
  const walk = (list: readonly Block[] | undefined) => {
    for (const block of list ?? []) {
      out.push(block);
      const content = block.content as Record<string, unknown>;
      if (Array.isArray(content?.blocks)) walk(content.blocks as Block[]);
      if (Array.isArray(content?.columns)) for (const col of content.columns as Array<{ blocks?: Block[] }>) walk(col.blocks);
      if (Array.isArray(content?.tabs)) for (const tab of content.tabs as Array<{ blocks?: Block[] }>) walk(tab.blocks);
    }
  };
  walk(blocks);
  return out;
}

function blockLabel(block: Block, index: number): string {
  const html = (block.content as { html?: string }).html ?? '';
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? (text.length > 48 ? `${text.slice(0, 47)}…` : text) : `Text block ${index + 1}`;
}

const techniqueTool: Builder = (root, env) => {
  let cancel = () => undefined as void;
  const status = el('p', 'ct-sub', 'Loading techniques…');
  root.append(status);
  loadLiteraryElements()
    .then((table) => {
      status.remove();
      const sources = flattenBlocks(env.pageBlocks)
        .filter((block) => block.block_type === 'rich_text')
        .map((block, i) => ({ block, label: blockLabel(block, i), techniques: spinnerTechniques(block, table) }))
        .filter((source) => source.techniques.length > 0);
      if (!sources.length) {
        root.append(
          el(
            'p',
            'ct-empty',
            env.viewer === 'teacher'
              ? 'No techniques approved on this page yet. Open a text block, run Technique scan, tick the techniques to use and save.'
              : 'Your teacher has not set any techniques for this page yet.'
          )
        );
        return;
      }
      let source = sources[0];
      const used = new Set<string>();
      const select = el('select', 'ct-select');
      select.id = `ct-tech-src-${env.uid}`;
      sources.forEach((s, i) => {
        const option = el('option', '', s.label);
        option.value = String(i);
        select.append(option);
      });
      const mode = el('select', 'ct-select');
      mode.id = `ct-tech-mode-${env.uid}`;
      for (const [value, label] of [['find', 'Find it in the text'], ['use', 'Use it in your writing']]) {
        const option = el('option', '', label);
        option.value = value;
        mode.append(option);
      }
      const found = el('p', 'ct-sub');
      const chips = el('div', 'ct-tags');
      const out = el('div', 'ct-tech');
      const go = btn('Spin', 'ct-btn ct-btn--go');
      const noRepeat = checkbox(`ct-tech-norep-${env.uid}`, 'No repeats', true);

      const colourOf = (tech: LiteraryTechnique) => familyOfTechnique(table, tech)?.colour ?? 'var(--line)';
      const tile = (tech: LiteraryTechnique | null) => {
        const box = el('div', 'ct-tech__tile');
        box.style.setProperty('--fc', tech ? colourOf(tech) : 'var(--line)');
        box.append(el('b', '', tech?.symbol ?? '?'), el('small', '', tech ? familyOfTechnique(table, tech)?.name ?? '' : 'Spin'));
        return box;
      };
      const paintSource = () => {
        found.textContent = `${source.techniques.length} ${source.techniques.length === 1 ? 'technique' : 'techniques'} approved for this text. The spinner only lands on these.`;
        chips.replaceChildren(
          ...source.techniques.map((tech) => {
            const chip = el('span', 'ct-tag ct-tag--tech', tech.name);
            chip.dataset.id = tech.id;
            chip.style.setProperty('--fc', colourOf(tech));
            return chip;
          })
        );
        out.replaceChildren(tile(null));
        used.clear();
      };
      const highlight = (id: string) => {
        for (const chip of chips.querySelectorAll<HTMLElement>('.ct-tag--tech')) chip.classList.toggle('is-hit', chip.dataset.id === id);
      };

      select.addEventListener('change', () => {
        cancel();
        source = sources[Number(select.value)] ?? sources[0];
        paintSource();
      });
      go.addEventListener('click', () => {
        primeSound();
        let options = source.techniques.filter((tech) => !noRepeat.input.checked || !used.has(tech.id));
        if (!options.length) {
          used.clear();
          options = source.techniques;
        }
        const winner = options[randomIndex(options.length)];
        go.disabled = true;
        cancel = spin(
          14,
          () => {
            const pass = source.techniques[randomIndex(source.techniques.length)];
            out.replaceChildren(tile(pass), el('p', 'ct-tech__name is-rolling', pass.name));
            highlight(pass.id);
          },
          () => {
            used.add(winner.id);
            highlight(winner.id);
            const task = mode.value === 'use'
              ? `Use ${winner.name.toLowerCase()} once in your writing.`
              : `Find ${winner.name.toLowerCase()} in the text. What does it do to the reader?`;
            out.replaceChildren(
              tile(winner),
              el('p', 'ct-tech__name', winner.name),
              el('p', 'ct-tech__def', `${winner.definition}. ${winner.effect}.`.replace(/\.\./g, '.')),
              el('p', 'ct-tech__task', task)
            );
            go.disabled = false;
            chime(1);
          }
        );
      });

      const controls = [labelled('Text', select)];
      if (env.viewer === 'teacher') controls.push(labelled('Prompt', mode));
      root.append(row(...controls), found, chips, out, row(go, noRepeat.label));
      paintSource();
    })
    .catch(() => {
      status.textContent = 'The techniques did not load. Try again in a moment.';
    });
  return () => cancel();
};

export const TOOL_BUILDERS: Record<ClassroomToolId, Builder> = {
  timer: timerTool,
  stopwatch: stopwatchTool,
  names: namesTool,
  number: numberTool,
  groups: groupsTool,
  technique: techniqueTool,
  scores: scoresTool,
  coin: coinTool,
  dice: diceTool
};
