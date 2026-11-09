import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Block } from '@/schemas/block';
import type { QuizResponse } from '@/quiz/core';
import { el } from '@/quiz/dom';
import { mountQuestionPlayer } from '@/quiz/player';
import { renderBlock } from '@/blocks/render';
import { studentUnitAnthology } from '@/blocks/anthology-load';
import { ROTATION_DIAL_LABELS, ROTATION_KIND_INFO, ROTATION_LEVEL_LABELS, ROTATION_PATH_LABELS, type PublicRotation, type PublicStation } from './schema';
import { isRotationFinale, rotationStationOf, sectionBlocks } from './model';
import type { RotationClient, RotationStatus } from './api';
import { mountStationCard, type StationCard } from './station-card';
import { mountEvidenceBoard } from './board';
import './rotation.css';

export type RotationPlayerOptions = {
  lesson: PublishedLesson;
  classId?: string;
  /** Null when opened without a class: the student is asked to open it from their class page. */
  client: RotationClient | null;
  renderHero: (host: HTMLElement) => void;
  /** Poll interval; tests shorten it. */
  pollMs?: number;
};

type View = 'pretest' | 'map' | 'station' | 'finale';

/** Map positions: the teacher's, else laid out in rows of three, with the teacher station and finale along the bottom. */
export function mapPositions(stations: PublicStation[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  const learning = stations.filter((s) => s.kind !== 'teacher');
  const rows = Math.max(1, Math.ceil(learning.length / 3));
  learning.forEach((s, i) => {
    const row = Math.floor(i / 3);
    const inRow = Math.min(3, learning.length - row * 3);
    const col = i % 3;
    const x = inRow === 1 ? 50 : inRow === 2 ? 30 + col * 40 : 18 + col * 32;
    out[s.id] = { x: s.x ?? x, y: s.y ?? 18 + row * (rows > 1 ? 48 / (rows - 1 || 1) : 0) };
  });
  const teacher = stations.find((s) => s.kind === 'teacher');
  if (teacher) out[teacher.id] = { x: teacher.x ?? 22, y: teacher.y ?? 84 };
  out.__finale = { x: 78, y: 84 };
  return out;
}

const levelChip = (level: string | undefined) => el('span', `rot-lvl rot-lvl--${level ?? 'none'}`, level ? ROTATION_LEVEL_LABELS[level as 'core'] : 'No level yet');

export function mountRotationPlayer(host: HTMLElement, options: RotationPlayerOptions): { dispose(): void } {
  const { lesson, client } = options;
  const r = lesson.rotation as PublicRotation;
  const pageBlocks = lesson.blocks as Block[];
  const learning = r.stations.filter((s) => s.kind !== 'teacher');
  const numberOf = (id: string) => learning.findIndex((s) => s.id === id) + 1;
  const intro = pageBlocks.filter((b) => rotationStationOf(b) === undefined && !isRotationFinale(b));
  const finaleBlocks = sectionBlocks(pageBlocks.find(isRotationFinale));
  const sectionOf = (id: string) => sectionBlocks(pageBlocks.find((b) => rotationStationOf(b) === id));
  const render = (b: Block) => renderBlock(b, 'student', { lessonId: lesson.lesson_id, pageBlocks, loadAnthology: () => studentUnitAnthology(lesson.unit_id) });

  let status: RotationStatus | null = null;
  let view: View | null = null;
  let tab: 'map' | 'board' = 'map';
  let stationId: string | null = null;
  let card: StationCard | null = null;
  let pretestAt: string | null = null;
  let skippedPretest = false;
  let poll = 0;
  let disposed = false;
  let mapMsg = '';
  const drafts: { pretest: Record<string, QuizResponse>; build: string | null; debrief: Record<string, string> } = { pretest: {}, build: null, debrief: {} };
  const sigs: Record<string, string> = {};

  const shell = el('div', 'rot rot-player');
  const hero = el('div', 'rot-hero-host');
  options.renderHero(hero);
  const story = el('div');
  if (r.story?.intro) {
    const p = el('div', 'rot-panel');
    p.append(el('p', 'rot-eyebrow', r.story.title || 'The story'), el('p', '', r.story.intro));
    story.append(p);
  }
  const introHost = el('div', 'rot-blocks');
  for (const b of intro) introHost.append(render(b));
  const called = el('div');
  const err = el('p', 'rot-err');
  err.setAttribute('role', 'alert');
  const body = el('div', 'rot-grid');
  shell.append(hero, story, introHost, called, err, body);
  host.replaceChildren(shell);

  const run = async (go: () => Promise<RotationStatus>): Promise<RotationStatus | null> => {
    if (!client) return null;
    const next = await go();
    apply(next);
    return next;
  };
  const act = async (go: () => Promise<RotationStatus>, btn?: HTMLButtonElement): Promise<RotationStatus | null> => {
    err.textContent = '';
    if (btn) btn.disabled = true;
    try {
      return await run(go);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t save. Try again.';
      return null;
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // ------------------------------------------------------------ identity

  function gateMessage(text: string, withInitials = false): void {
    view = null;
    const box = el('div', 'rot-gate-msg');
    box.append(el('p', '', text));
    if (withInitials && client) {
      const row = el('div', 'rot-row');
      const input = el('input', 'rot-input');
      input.maxLength = 4;
      input.style.maxWidth = '8rem';
      input.setAttribute('aria-label', 'Your initials');
      const go = el('button', 'rot-btn rot-btn--small rot-btn--primary', 'Start');
      go.type = 'button';
      go.addEventListener('click', () => void act(() => client.claim(input.value.trim()), go));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
      row.append(input, go);
      box.append(row);
    }
    body.replaceChildren(box);
  }

  // ------------------------------------------------------------ pretest

  const pretestLeft = (s: RotationStatus) => s.pretest.items.filter((i) => !s.pretest.results[i.id]);

  function levelsAside(s: RotationStatus): HTMLElement {
    const aside = el('aside', 'rot-panel');
    aside.append(el('p', 'rot-eyebrow', 'Your levels'), el('p', 'rot-small rot-muted', 'They fill in as you answer.'));
    for (const st of learning) {
      const row = el('div', 'rot-lvl-row');
      const info = s.levels[st.id];
      row.append(el('span', '', st.title), levelChip(info?.source === 'pretest' ? info.level : undefined));
      aside.append(row);
    }
    return aside;
  }

  function paintPretest(s: RotationStatus): void {
    const items = s.pretest.items;
    const left = pretestLeft(s);
    // Stay on a question just answered so its right answer shows, until Next.
    const current = items.find((i) => i.id === pretestAt) ?? left[0] ?? null;
    if (!current) { view = 'map'; paint(); return; }
    pretestAt = current.id;
    const answered = items.length - left.length;
    const sig = JSON.stringify([current.id, !!s.pretest.results[current.id], answered]);
    if (sigs.pretest === sig) return;
    sigs.pretest = sig;
    const grid = el('div', 'rot-grid rot-grid--side');
    const main = el('div', 'rot-panel');
    const minutes = Math.ceil((items.length * 30) / 60);
    main.append(el('p', 'rot-eyebrow', `Before the stations · about ${minutes} minutes · not marked`), el('h2', '', 'Pretest'),
      el('p', 'rot-small rot-muted', 'Three questions a station. Getting things wrong now helps you learn them later, so just have a go. Your answers set your level at each station.'));
    const bar = el('div', 'rot-pt-progress');
    bar.setAttribute('aria-hidden', 'true');
    const fill = el('span');
    fill.style.width = `${(answered / Math.max(1, items.length)) * 100}%`;
    bar.append(fill);
    const n = items.indexOf(current) + 1;
    main.append(bar, el('p', 'rot-small rot-muted', `Question ${n} of ${items.length} · ${r.stations.find((x) => x.id === current.station)?.title ?? ''}`));
    const q = el('div', 'rot-pt-q');
    const result = s.pretest.results[current.id];
    if (result) {
      q.append(mountQuestionPlayer({ question: current.question, result: { mark: result.mark, key: result.key ?? null }, locked: true }));
      q.append(el('p', 'rot-feedback', result.mark.correct ? 'Right.' : 'Not this time: the right answer is shown above.'));
      const next = el('button', 'rot-btn rot-btn--small rot-btn--primary', left.length ? 'Next question' : 'See your map');
      next.type = 'button';
      next.addEventListener('click', () => { pretestAt = null; sigs.pretest = ''; if (!left.length) view = 'map'; paint(); });
      q.append(next);
    } else {
      let response: QuizResponse | null = drafts.pretest[current.id] ?? null;
      q.append(mountQuestionPlayer({ question: current.question, ...(response ? { response } : {}), shuffle: true, seed: `${lesson.lesson_id}:${current.id}`, onChange: (rr) => { response = rr; drafts.pretest[current.id] = rr; } }));
      const check = el('button', 'rot-btn rot-btn--small rot-btn--primary', 'Check');
      check.type = 'button';
      check.addEventListener('click', () => { if (!response) { err.textContent = 'Answer the question first.'; return; } void act(() => client!.pretest(current.id, response!), check); });
      q.append(check);
    }
    main.append(q);
    const skip = el('button', 'rot-link', 'Skip the pretest for now');
    skip.type = 'button';
    skip.addEventListener('click', () => { skippedPretest = true; view = 'map'; paint(); });
    main.append(el('p', 'rot-note', 'Skip it and you start every station at Core. You can come back to it from the map.'), skip);
    grid.append(main, levelsAside(s));
    body.replaceChildren(grid);
  }

  // ------------------------------------------------------------ map, board, passport

  function stateOf(s: RotationStatus, st: PublicStation): 'done' | 'rec' | 'full' | 'locked' | 'open' {
    if (s.work?.collected.includes(st.id)) return 'done';
    if (s.locks[st.id]) return 'locked';
    if (s.recommend === st.id) return 'rec';
    if ((s.seats[st.id] ?? 0) >= st.seats) return 'full';
    return 'open';
  }

  function node(s: RotationStatus, st: PublicStation, at: { x: number; y: number }): HTMLElement {
    const teacher = st.kind === 'teacher';
    const state = teacher ? 'open' : stateOf(s, st);
    const b = el('button', `rot-node${teacher ? ' rot-node--teacher' : ''}`);
    b.type = 'button';
    b.dataset.state = state;
    b.dataset.station = st.id;
    if (teacher && s.called) b.dataset.called = 'true';
    b.style.left = `${at.x}%`;
    b.style.top = `${at.y}%`;
    const top = el('span', 'rot-node__top');
    top.append(el('span', 'rot-node__num', teacher ? 'Teacher' : `Station ${numberOf(st.id)}${st.token && s.work?.collected.includes(st.id) ? ` · ${st.token}` : ''}`));
    if (!teacher) top.append(levelChip(s.levels[st.id]?.level));
    const words = { done: 'Done', rec: 'Go here next', full: 'Full', locked: s.locks[st.id] ?? 'Locked', open: st.id === s.work?.current ? 'You’re here' : '' }[state];
    b.append(top, el('span', 'rot-node__title', st.title), el('span', 'rot-node__sub', teacher ? (s.called ? 'Your teacher is calling you' : 'When your teacher calls you') : `${ROTATION_KIND_INFO[st.kind].label} · ${st.minutes} min`));
    const foot = el('span', 'rot-node__foot');
    const seats = el('span', 'rot-seats');
    seats.setAttribute('aria-label', `${s.seats[st.id] ?? 0} of ${st.seats} seats taken`);
    for (let i = 0; i < st.seats; i++) seats.append(el('i', i < (s.seats[st.id] ?? 0) ? 'on' : ''));
    foot.append(seats, el('span', '', words));
    b.append(foot);
    const guidedLock = !s.route_open && !teacher && state !== 'done' && state !== 'rec' && st.id !== s.work?.current;
    if (state === 'locked' || guidedLock) b.setAttribute('aria-disabled', 'true');
    b.addEventListener('click', () => {
      if (state === 'locked') { mapMsg = s.locks[st.id]!; sigs.map = ''; paint(); return; }
      if (guidedLock) { mapMsg = 'Your teacher has set your route for now: go to the station marked “Go here next”.'; sigs.map = ''; paint(); return; }
      void openStation(st.id);
    });
    return b;
  }

  async function openStation(id: string): Promise<void> {
    mapMsg = '';
    const next = await act(() => client!.open(id));
    if (!next) return;
    stationId = id;
    card = null;
    view = 'station';
    paint();
    window.scrollTo?.({ top: 0 });
  }

  function passport(s: RotationStatus): HTMLElement {
    const p = el('div', 'rot-panel');
    p.append(el('p', 'rot-eyebrow', 'Passport'));
    const list = el('div', 'rot-passport');
    for (const st of learning) {
      const got = s.work?.collected.includes(st.id) ?? false;
      const piece = el('div', `rot-piece${got ? ' rot-piece--got' : ''}`);
      const text = el('div');
      text.append(el('b', '', st.title), el('br'), el('span', got ? '' : 'rot-muted', got ? st.piece || 'Collected.' : 'Not collected yet'));
      piece.append(el('span', 'rot-piece__tok', st.token || String(numberOf(st.id))), text);
      list.append(piece);
    }
    p.append(list);
    return p;
  }

  let board: ReturnType<typeof mountEvidenceBoard> | null = null;
  const mapHost = el('div', 'rot-grid');
  const boardHost = el('div');
  const seg = el('div', 'rot-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Show');
  const tabBtn = (id: 'map' | 'board', text: string) => {
    const b = el('button', '', text);
    b.type = 'button';
    b.addEventListener('click', () => { tab = id; sigs.tabs = ''; paint(); });
    return b;
  };
  const mapBtn = tabBtn('map', 'Map');
  const boardBtn = tabBtn('board', 'Evidence board');
  seg.append(mapBtn, boardBtn);
  const mapLayout = el('div', 'rot-grid rot-grid--side');
  const mapMain = el('div', 'rot-grid');
  const mapAside = el('aside', 'rot-grid');
  mapLayout.append(mapMain, mapAside);

  function paintMap(s: RotationStatus): void {
    if (body.firstElementChild !== mapLayout) { body.replaceChildren(mapLayout); sigs.map = ''; sigs.tabs = ''; }
    const showBoard = r.evidence === 'board';
    if (!showBoard) tab = 'map';
    const tsig = `${tab}`;
    if (sigs.tabs !== tsig) {
      sigs.tabs = tsig;
      mapBtn.setAttribute('aria-pressed', String(tab === 'map'));
      boardBtn.setAttribute('aria-pressed', String(tab === 'board'));
      const head = el('div', 'rot-row rot-row--between');
      if (showBoard) head.append(seg);
      mapMain.replaceChildren(head, mapHost, boardHost);
    }
    mapHost.hidden = tab !== 'map';
    boardHost.hidden = tab !== 'board';
    if (showBoard) {
      if (!board) { board = mountEvidenceBoard({ rotation: r, client: client!, run }); boardHost.append(board.root); }
      board.update(s);
    }
    const sig = JSON.stringify([s.locks, s.recommend, s.seats, s.levels, s.work?.collected, s.work?.current, s.called, s.pieces_left, s.route_open, mapMsg, pretestLeft(s).length, skippedPretest]);
    if (sigs.map !== sig) {
      sigs.map = sig;
      const parts: HTMLElement[] = [];
      const left = pretestLeft(s).length;
      if (left) {
        const p = el('div', 'rot-row rot-gate-msg');
        p.append(el('span', 'rot-small', `${left} pretest question${left === 1 ? '' : 's'} left. They set your level at each station.`));
        const go = el('button', 'rot-btn rot-btn--small', 'Finish the pretest');
        go.type = 'button';
        go.addEventListener('click', () => { view = 'pretest'; skippedPretest = false; sigs.pretest = ''; paint(); });
        p.append(go);
        parts.push(p);
      }
      const rec = r.stations.find((x) => x.id === s.recommend);
      parts.push(el('p', 'rot-small rot-muted', `${ROTATION_PATH_LABELS[r.path]} · ${ROTATION_DIAL_LABELS[r.dial]} control. ${rec ? `Go to ${rec.title} next${s.route_open ? ', or pick another' : ''}.` : s.pieces_left === 0 ? 'You have every piece you need: open the finale.' : ''}`));
      if (mapMsg) parts.push(el('p', 'rot-feedback', mapMsg));
      const map = el('div', 'rot-map');
      map.setAttribute('aria-label', 'Station map');
      const at = mapPositions(r.stations);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'rot-map__links');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const order = [...learning.map((x) => x.id), '__finale'];
      for (let i = 0; i + 1 < order.length; i++) {
        const a = at[order[i]!]!;
        const b = at[order[i + 1]!]!;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y)); line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y));
        svg.append(line);
      }
      map.append(svg);
      for (const st of [...learning, ...r.stations.filter((x) => x.kind === 'teacher')]) map.append(node(s, st, at[st.id]!));
      const fin = el('button', 'rot-node rot-node--finale');
      fin.type = 'button';
      fin.dataset.station = 'finale';
      fin.style.left = `${at.__finale!.x}%`;
      fin.style.top = `${at.__finale!.y}%`;
      const ready = s.pieces_left === 0;
      fin.append(el('span', 'rot-node__num', 'Finale'), el('span', 'rot-node__title', r.story?.title ? `${r.story.title}: the finale` : 'The finale'), el('span', 'rot-node__sub', ready ? 'Open: every piece collected' : `${s.pieces_left} piece${s.pieces_left === 1 ? '' : 's'} left`));
      if (!ready) fin.setAttribute('aria-disabled', 'true');
      fin.addEventListener('click', () => { if (ready) { view = 'finale'; paint(); window.scrollTo?.({ top: 0 }); } else { mapMsg = `Collect ${s.pieces_left} more piece${s.pieces_left === 1 ? '' : 's'} to open the finale.`; sigs.map = ''; paint(); } });
      map.append(fin);
      const legend = el('div', 'rot-legend');
      for (const [label, style] of [['Done', 'background:var(--pastel-sage)'], ['Go here next', 'background:#fff;box-shadow:0 0 0 2px var(--wave)'], ['Teacher station', 'background:var(--pastel-gold)'], ['Locked', 'background:var(--cotton);border:1px dashed var(--muted)']] as const) {
        const span = el('span');
        const sw = el('b');
        sw.setAttribute('style', style);
        span.append(sw, document.createTextNode(label));
        legend.append(span);
      }
      legend.append(el('span', '', 'Dots: seats taken · Level: from your pretest'));
      parts.push(map, legend);
      mapHost.replaceChildren(...parts);
    }
    const psig = JSON.stringify(s.work?.collected);
    if (sigs.passport !== psig) { sigs.passport = psig; mapAside.replaceChildren(passport(s)); }
  }

  // ------------------------------------------------------------ station

  function paintStation(s: RotationStatus): void {
    const st = r.stations.find((x) => x.id === stationId);
    if (!st) { view = 'map'; paint(); return; }
    if (!card) {
      card = mountStationCard({
        station: st,
        number: numberOf(st.id),
        rotation: r,
        blocks: sectionOf(st.id),
        lessonId: lesson.lesson_id,
        unitId: lesson.unit_id,
        pageBlocks,
        client: client!,
        run,
        onBack: () => { card = null; view = 'map'; stationId = null; sigs.map = ''; paint(); window.scrollTo?.({ top: 0 }); }
      });
      body.replaceChildren(card.root);
    }
    card.update(s);
  }

  // ------------------------------------------------------------ finale

  function paintFinale(s: RotationStatus): void {
    const f = s.work?.finale ?? {};
    const sig = JSON.stringify([f.lock_passed, f.lock_tries, f.format, s.board, s.work?.exits, s.fallback_on, s.pieces_left]);
    if (sigs.finale === sig) return;
    sigs.finale = sig;
    const grid = el('div', 'rot-grid rot-grid--2');
    const left = el('div', 'rot-grid');
    const right = el('div', 'rot-grid');
    grid.append(left, right);
    const back = el('button', 'rot-btn rot-btn--small', '← Map');
    back.type = 'button';
    back.addEventListener('click', () => { view = 'map'; sigs.map = ''; paint(); });
    const lockNeeded = !!r.finale.lock;
    const open = !lockNeeded || f.lock_passed;
    if (finaleBlocks.length) { const p = el('div', 'rot-blocks'); for (const b of finaleBlocks) p.append(render(b)); left.append(p); }
    if (r.finale.lock) {
      const lock = el('div', 'rot-lock');
      const head = el('div', 'rot-row rot-row--between');
      head.append(el('b', '', r.story?.title ? `${r.story.title}: the lock` : 'The lock'));
      const tokens = learning.filter((x) => x.token);
      if (tokens.length) {
        const row = el('div', 'rot-tokens');
        for (const t of tokens) { const sp = el('span', '', t.token); sp.dataset.got = String(s.work?.collected.includes(t.id) ?? false); row.append(sp); }
        head.append(row);
      }
      lock.append(head);
      if (tokens.length) lock.append(el('p', '', 'Your letters prove you’ve been to each station. The lock asks something only all the pieces can answer together.'));
      lock.append(el('p', '', ''));
      (lock.lastElementChild as HTMLElement).append(el('b', '', r.finale.lock.prompt));
      const opts = el('div', 'rot-opts');
      const fb = el('p', 'rot-feedback');
      for (const opt of r.finale.lock.options) {
        const b = el('button', 'rot-opt', opt.text);
        b.type = 'button';
        b.disabled = !!f.lock_passed;
        b.addEventListener('click', () => void act(() => client!.lock(opt.id), b).then((next) => {
          if (!next?.lock) return;
          b.dataset.res = next.lock.right ? 'right' : 'wrong';
          fb.textContent = next.lock.right ? 'Open. Now build your answer.' : 'Not that one. Look at how your pieces link, then try again.';
        }));
        opts.append(b);
      }
      if (f.lock_passed) fb.textContent = 'Open.';
      lock.append(opts, fb);
      left.append(lock);
    }
    const build = el('div', 'rot-panel');
    build.append(el('h3', '', 'Build'));
    if (!open) build.append(el('p', 'rot-note', 'Opens with the lock.'));
    else if (s.fallback_on && r.behind_fallback === 'skip_finale_build') build.append(el('p', 'rot-note', 'Your teacher has skipped the build today. Go on to the debrief.'));
    else {
      build.append(el('p', 'rot-small rot-muted', `${ROTATION_DIAL_LABELS[r.dial]} control${r.dial === 'guided' ? '' : ': pick a format'}. Your evidence board comes with you, links and all.`));
      if (r.dial !== 'guided' && r.finale.formats.length > 1) {
        const segF = el('div', 'rot-seg');
        segF.setAttribute('role', 'group');
        segF.setAttribute('aria-label', 'Format');
        for (const fmt of r.finale.formats) {
          const b = el('button', '', fmt);
          b.type = 'button';
          b.setAttribute('aria-pressed', String((f.format ?? r.finale.formats[0]) === fmt));
          b.addEventListener('click', () => void act(() => client!.finale({ format: fmt })));
          segF.append(b);
        }
        build.append(segF);
      } else if (r.finale.formats[0]) build.append(el('p', 'rot-small', `Format: ${r.finale.formats[0]}`));
      const slots = el('div', 'rot-grid');
      slots.style.gap = '8px';
      for (const id of s.work?.collected ?? []) {
        const st = r.stations.find((x) => x.id === id);
        if (!st || st.kind === 'teacher') continue;
        const slot = el('div', 'rot-build-slot');
        slot.append(el('b', '', `${st.title}${st.token ? ` · ${st.token}` : ''}`), document.createTextNode(st.piece || 'Collected.'));
        slots.append(slot);
      }
      for (const l of s.board.links) {
        const a = r.stations.find((x) => x.id === l.from)?.title;
        const b = r.stations.find((x) => x.id === l.to)?.title;
        const slot = el('div', 'rot-build-slot');
        slot.append(el('b', '', 'Your link'), document.createTextNode(`${a} ${l.word} ${b}`));
        slots.append(slot);
      }
      const ta = el('textarea', 'rot-input');
      ta.rows = 6;
      ta.maxLength = 4000;
      ta.value = drafts.build ?? f.build ?? '';
      ta.setAttribute('aria-label', r.finale.build_prompt);
      ta.addEventListener('input', () => { drafts.build = ta.value; });
      const save = el('button', 'rot-btn rot-btn--small rot-btn--primary', 'Save');
      save.type = 'button';
      const savedMsg = el('span', 'rot-saved');
      save.addEventListener('click', () => void act(() => client!.finale({ build: drafts.build ?? ta.value }), save).then((next) => { savedMsg.textContent = next ? 'Saved' : ''; }));
      const row = el('div', 'rot-row');
      row.append(save, savedMsg);
      build.append(slots, el('label', 'rot-field'), row);
      (build.children[build.children.length - 2] as HTMLElement).append(el('span', '', r.finale.build_prompt), ta);
    }
    left.append(build);

    const growth = el('div', 'rot-panel');
    growth.append(el('h3', '', 'Pretest to exit check'), el('p', 'rot-small rot-muted', 'Blue: your pretest. Green: your exit check at that station.'));
    const rows = el('div', 'rot-growth');
    let jump: { title: string; from: string; to: string } | null = null;
    for (const st of learning) {
      const items = s.pretest.items.filter((i) => i.station === st.id);
      const right = items.filter((i) => s.pretest.results[i.id]?.mark.correct).length;
      const exit = s.work?.exits[st.id];
      const row = el('div', 'rot-growth__row');
      const bars = el('div', 'rot-bars');
      const pre = el('div', 'rot-bar rot-bar--pre');
      pre.style.width = `${items.length ? (right / items.length) * 100 : 0}%`;
      const ex = el('div', 'rot-bar rot-bar--exit');
      ex.style.width = exit ? (exit.correct ? '100%' : '15%') : '0';
      bars.append(pre, ex);
      row.append(el('span', '', st.title), bars, el('span', '', exit ? (exit.correct ? `${right}/${items.length} → passed` : `${right}/${items.length} → not yet`) : `${right}/${items.length}`));
      rows.append(row);
      const lv = s.levels[st.id];
      if (exit?.correct && right < items.length && (!jump || right === 0)) jump = { title: st.title, from: lv?.level ?? 'core', to: 'passed' };
    }
    growth.append(rows);
    if (jump) growth.append(el('p', 'rot-small', `Biggest jump: ${jump.title}. You started on ${ROTATION_LEVEL_LABELS[jump.from as 'core']} and passed the exit check.`));
    right.append(growth);

    const debrief = el('div', 'rot-panel');
    debrief.append(el('h3', '', 'Debrief'));
    r.finale.debrief.forEach((q, i) => {
      const ta = el('textarea', 'rot-input');
      ta.rows = 3;
      ta.maxLength = 1200;
      ta.value = drafts.debrief[i] ?? f.debrief?.[i] ?? '';
      ta.addEventListener('input', () => { drafts.debrief[i] = ta.value; });
      const label = el('label', 'rot-field');
      label.append(el('span', '', q), ta);
      debrief.append(label);
    });
    if (r.finale.debrief.length) {
      const save = el('button', 'rot-btn rot-btn--small', 'Save my debrief');
      save.type = 'button';
      const savedMsg = el('span', 'rot-saved');
      save.addEventListener('click', () => {
        const answers: Record<string, string> = {};
        r.finale.debrief.forEach((_, i) => { answers[i] = drafts.debrief[i] ?? f.debrief?.[i] ?? ''; });
        void act(() => client!.finale({ debrief: answers }), save).then((next) => { savedMsg.textContent = next ? 'Saved' : ''; });
      });
      const row = el('div', 'rot-row');
      row.append(save, savedMsg);
      debrief.append(row);
      if (!open) debrief.append(el('p', 'rot-note', 'You can answer these once the lock is open.'));
      for (const t of debrief.querySelectorAll('textarea')) t.disabled = !open;
      save.disabled = !open;
    }
    right.append(debrief);
    const wrap = el('div', 'rot-grid');
    wrap.append(back, grid);
    body.replaceChildren(wrap);
  }

  // ------------------------------------------------------------ status

  function paintCalled(s: RotationStatus): void {
    const sig = JSON.stringify(s.called);
    if (sigs.called === sig) return;
    sigs.called = sig;
    called.replaceChildren();
    if (!s.called) return;
    const bar = el('div', 'rot-calledbar');
    bar.setAttribute('role', 'status');
    bar.append(el('span', '', `Your teacher is calling your group to the ${s.called.title.toLowerCase()}. Whatever you’re doing is saved; come back to it after.`));
    called.append(bar);
  }

  function paint(): void {
    if (!status) return;
    const s = status;
    if (s.identity.need === 'class') return gateMessage('Open this rotation from your class page.');
    if (s.not_for_you) return gateMessage('This rotation is for another class.');
    if (s.anonymous) return gateMessage('Your teacher hasn’t added a class list yet.');
    if (s.identity.need === 'initials') return gateMessage('Type your initials to start.', true);
    if (!s.work) return;
    paintCalled(s);
    if (view === null) view = pretestLeft(s).length && !skippedPretest ? 'pretest' : s.work.current ? 'station' : 'map';
    if (view === 'station' && !stationId) stationId = s.work.current;
    if (view === 'pretest') paintPretest(s);
    else if (view === 'station') paintStation(s);
    else if (view === 'finale') paintFinale(s);
    else paintMap(s);
  }

  function apply(next: RotationStatus): void {
    status = next;
    // A live update repaints in place: the open tab, typed text and scroll position stay.
    paint();
  }

  async function refresh(): Promise<void> {
    if (!client || disposed) return;
    try {
      apply(await client.status());
    } catch (e) {
      if (!status) gateMessage(e instanceof Error ? e.message : 'This rotation didn’t load. Refresh to try again.');
    }
  }

  if (!client) gateMessage('Open this rotation from your class page.');
  else {
    void refresh();
    poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, options.pollMs ?? 8000);
  }

  return {
    dispose(): void {
      disposed = true;
      window.clearInterval(poll);
      board?.dispose();
      host.replaceChildren();
    }
  };
}
