import type { Block } from '@/schemas/block';
import type { PublicQuestion, QuizResponse } from '@/quiz/core';
import { el } from '@/quiz/dom';
import { mountQuestionPlayer } from '@/quiz/player';
import { renderBlock } from '@/blocks/render';
import { studentUnitAnthology } from '@/blocks/anthology-load';
import { ROTATION_KIND_INFO, ROTATION_LEVELS, ROTATION_LEVEL_LABELS, WRITTEN_CHECK_LABELS, type PublicRotation, type PublicStation, type RotationLevel } from './schema';
import { arrivalFromOf, cardOrder, forLevel, gateViewOf, lockOf, roleOf } from './model';
import { allLocksPassed, kitCard, kitFor, lockExitBlocks, mountLockChain } from './lock-chain';
import type { Marked, RotationClient, RotationStatus } from './api';

export type StationCardOptions = {
  station: PublicStation;
  number: number;
  rotation: PublicRotation;
  blocks: Block[];
  lessonId: string;
  unitId: string;
  pageBlocks: Block[];
  client: RotationClient;
  /** Runs a client call and applies the status; rejects with a readable message. */
  run: (go: () => Promise<RotationStatus>) => Promise<RotationStatus | null>;
  onBack: () => void;
  /** Swaps content without the page jumping (the player's keepScroll). */
  keepScroll?: (swap: () => void) => void;
};

export type StationCard = { root: HTMLElement; update(status: RotationStatus): void; dispose(): void };

const LOCK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/** A stable shuffle per student and station, so option order never gives the answer away and doesn't jump on reload. */
function seeded<T extends { id: string }>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

export function mountStationCard(o: StationCardOptions): StationCard {
  const s = o.station;
  const hasLocks = (s.locks?.length ?? 0) > 0;
  // Blocks that belong to a lock live in the lock chain; the rest work as today.
  const ordered = cardOrder(o.blocks.filter((b) => !lockOf(b)));
  const byRole = (role: string) => ordered.filter((b) => roleOf(b) === role);
  const hinge = byRole('gate').find((b) => b.block_type === 'hinge_question');
  const written = s.written_gate ?? null;
  const hasGate = !!hinge || !!written;
  const render = (b: Block) => renderBlock(b, 'student', { lessonId: o.lessonId, pageBlocks: o.pageBlocks, loadAnthology: () => studentUnitAnthology(o.unitId) });

  let status: RotationStatus | null = null;
  let level: RotationLevel | null = null;
  const sigs: Record<string, string> = {};
  const drafts: { reason: string; choice: string; writing: string; exits: Record<string, QuizResponse>; recall: QuizResponse | null; code: string } = { reason: '', choice: '', writing: '', exits: {}, recall: null, code: '' };
  let checking = false;

  const root = el('div', 'rot-grid rot-grid--side rot-station');
  root.dataset.station = s.id;
  const main = el('div', 'rot-grid');
  const head = el('div', 'rot-row rot-row--between');
  const titles = el('div');
  titles.append(el('p', 'rot-eyebrow', `${s.kind === 'teacher' ? 'Teacher station' : `Station ${o.number}`} · ${ROTATION_KIND_INFO[s.kind].label}`), el('h2', '', s.title));
  const back = el('button', 'rot-btn rot-btn--small', '← Map');
  back.type = 'button';
  back.addEventListener('click', o.onBack);
  head.append(titles, back);
  const err = el('p', 'rot-err');
  err.setAttribute('role', 'alert');
  const steps = el('div', 'rot-steps');
  main.append(head, err, steps);

  const aside = el('aside', 'rot-grid');
  const about = el('div', 'rot-panel');
  const kitBox = el('div', 'rot-panel');
  kitBox.hidden = true;
  const help = el('div', 'rot-panel');
  aside.append(about, kitBox, help);
  const completeBox = el('div', 'rot-complete-host');
  root.append(main, aside, completeBox);

  const act = async (go: () => Promise<RotationStatus>, btn?: HTMLButtonElement): Promise<RotationStatus | null> => {
    err.textContent = '';
    if (btn) btn.disabled = true;
    try {
      return await o.run(go);
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'That didn’t save. Try again.';
      return null;
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  const sect = (cls: string, title: string, end?: HTMLElement): { box: HTMLElement; body: HTMLElement } => {
    const box = el('section', `rot-sect ${cls}`.trim());
    const h = el('div', 'rot-sect__head');
    const num = el('span', 'rot-sect__n');
    num.setAttribute('aria-hidden', 'true');
    h.append(num, el('span', 'rot-sect__title', title));
    if (end) { end.classList.add('rot-sect__end'); h.append(end); }
    const body = el('div', 'rot-blocks');
    box.append(h, body);
    return { box, body };
  };
  const blockList = (list: Block[]) => { const wrap = el('div', 'rot-blocks'); for (const b of list) wrap.append(render(b)); return wrap; };
  const marked = (question: PublicQuestion, result: Marked | undefined, onAnswer: (r: QuizResponse) => void, draftKey: string, saved?: QuizResponse | null): HTMLElement => {
    const wrap = el('div', 'rot-grid');
    wrap.style.gap = '8px';
    if (result) {
      wrap.append(mountQuestionPlayer({ question, result: { mark: result.mark, key: result.key ?? null }, locked: true }));
      return wrap;
    }
    let response: QuizResponse | null = saved ?? null;
    const player = mountQuestionPlayer({ question, ...(saved ? { response: saved } : {}), shuffle: true, seed: `${o.lessonId}:${draftKey}`, onChange: (r) => { response = r; if (draftKey.startsWith('exit:')) drafts.exits[draftKey] = r; else drafts.recall = r; } });
    const check = el('button', 'rot-btn rot-btn--small rot-btn--primary', 'Check');
    check.type = 'button';
    check.addEventListener('click', () => { if (response) onAnswer(response); else err.textContent = 'Answer the question first.'; });
    wrap.append(player, check);
    return wrap;
  };

  // ---- recall
  const recallBlock = byRole('recall').find((b) => b.block_type === 'quiz_question');
  const recallBox = el('div');
  function paintRecall(st: RotationStatus): void {
    const done = st.work?.done ?? [];
    const from = recallBlock ? arrivalFromOf(recallBlock) : '';
    const fromStation = from === 'previous' ? done.filter((id) => id !== s.id).pop() : done.includes(from) ? from : undefined;
    const result = st.work?.recall[s.id];
    const sig = JSON.stringify([!!fromStation, result?.mark?.correct ?? null]);
    if (sigs.recall === sig) return;
    sigs.recall = sig;
    recallBox.replaceChildren();
    if (!recallBlock || !fromStation) return;
    const title = o.rotation.stations.find((x) => x.id === fromStation)?.title;
    const { box, body } = sect('rot-sect--recall', `Arrival recall${title ? ` · from ${title}` : ''}`);
    body.append(marked((recallBlock.content as { question: PublicQuestion }).question, result, (r) => void act(() => o.client.recall(s.id, recallBlock.id, r)), 'recall', drafts.recall));
    recallBox.append(box);
  }

  // ---- goal
  const goalBox = el('div');
  if (byRole('goal').length) {
    const { box, body } = sect('rot-sect--goal', 'Goal');
    body.append(blockList(byRole('goal')));
    goalBox.append(box);
  }

  // ---- steps with the level switch, and hints
  const levelSwitch = el('span', 'rot-levels');
  levelSwitch.setAttribute('role', 'group');
  levelSwitch.setAttribute('aria-label', 'Your level here');
  const stepsBox = el('div');
  const stepsSect = sect('', s.kind === 'teacher' ? 'With your teacher' : 'Steps', s.kind === 'teacher' ? undefined : levelSwitch);
  stepsBox.append(stepsSect.box);
  const hintsWrap = el('div', 'rot-grid');
  hintsWrap.style.gap = '6px';
  const hintRow = el('div', 'rot-row');
  const hintBtn = el('button', 'rot-btn rot-btn--small', 'Open a hint');
  hintBtn.type = 'button';
  hintBtn.addEventListener('click', () => void act(() => o.client.hint(s.id), hintBtn));
  const hintCount = el('span', 'rot-small rot-muted');
  hintRow.append(hintBtn, hintCount);
  function paintSteps(st: RotationStatus): void {
    const info = st.levels[s.id];
    const next = info?.level ?? 'core';
    const pretestLevel = info?.source === 'pretest' ? info.level : null;
    const sig = JSON.stringify([next, info?.source, o.rotation.dial]);
    if (sigs.steps !== sig) {
      sigs.steps = sig;
      level = next;
      levelSwitch.replaceChildren();
      const open = o.rotation.dial !== 'guided';
      for (const l of ROTATION_LEVELS) {
        const b = el('button', '', ROTATION_LEVEL_LABELS[l]);
        b.type = 'button';
        b.dataset.level = l;
        b.setAttribute('aria-pressed', String(l === next));
        if (l === pretestLevel) b.append(el('span', 'rot-rec-tag', 'PRETEST'));
        b.disabled = !open && l !== next;
        if (open && l !== next) b.addEventListener('click', () => void act(() => o.client.level(s.id, l)));
        levelSwitch.append(b);
      }
      stepsSect.body.replaceChildren(blockList(forLevel(byRole('step'), next)));
      sigs.hints = '';
    }
    const hints = forLevel(byRole('hint'), level ?? 'core');
    const opened = Math.min(st.work?.hints[s.id] ?? 0, hints.length);
    const hsig = JSON.stringify([level, opened]);
    if (sigs.hints !== hsig) {
      sigs.hints = hsig;
      hintsWrap.replaceChildren(...hints.slice(0, opened).map((h) => { const d = el('div', 'rot-hint'); d.append(render(h)); return d; }));
      hintCount.textContent = `${opened} of ${hints.length} opened`;
      hintBtn.disabled = opened >= hints.length;
      if (hints.length && !hintsWrap.isConnected) stepsSect.body.after(hintsWrap, hintRow);
      if (!hints.length) { hintsWrap.remove(); hintRow.remove(); }
    }
  }

  // ---- the gate
  const gateBox = el('div');
  const gated = el('div', 'rot-gated');
  const veil = el('div', 'rot-gated__veil');
  veil.innerHTML = `<span>${LOCK_SVG} Opens when you get the check right</span>`;
  const inner = el('div', 'rot-gated__inner');
  gated.append(veil, inner);

  function paintHinge(st: RotationStatus, body: HTMLElement): void {
    const g = st.gates[s.id];
    const state = g?.state ?? 'open';
    const content = hinge!.content as { prompt: string; options: Array<{ id: string; text: string }> };
    if (state === 'passed' || state === 'unlocked') {
      body.append(el('p', 'rot-feedback', state === 'unlocked' ? 'Your teacher opened this for you.' : 'Right. The rest of the station is open.'));
      return;
    }
    if (g?.reteach) {
      const card = el('div', 'rot-reteach');
      card.append(el('b', '', 'Look again: '), document.createTextNode(g.reteach));
      body.append(card);
    }
    if (state === 'flagged') {
      body.append(el('p', 'rot-feedback', 'Your teacher will go through this with you at the teacher station. You can do another station and come back.'));
      return;
    }
    const q = state === 'backup' && g?.backup ? g.backup : content;
    body.append(el('p', '', q.prompt));
    const opts = el('div', 'rot-opts');
    opts.setAttribute('role', 'radiogroup');
    for (const opt of seeded(q.options, `${o.lessonId}:${s.id}:${state}`)) {
      const b = el('button', 'rot-opt', opt.text);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-pressed', String(drafts.choice === opt.id));
      b.setAttribute('aria-checked', String(drafts.choice === opt.id));
      b.addEventListener('click', () => {
        drafts.choice = opt.id;
        for (const x of opts.querySelectorAll('button')) { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-checked', String(x === b)); }
      });
      opts.append(b);
    }
    const reason = el('textarea', 'rot-input');
    reason.rows = 2;
    reason.maxLength = 400;
    reason.value = drafts.reason;
    reason.placeholder = 'Because…';
    reason.setAttribute('aria-label', 'Your reason, at least three words');
    reason.addEventListener('input', () => { drafts.reason = reason.value; });
    const check = el('button', 'rot-btn rot-btn--small rot-btn--primary', 'Check');
    check.type = 'button';
    check.addEventListener('click', () => {
      if (!drafts.choice) { err.textContent = 'Pick an answer first.'; return; }
      if (drafts.reason.trim().split(/\s+/).filter(Boolean).length < 3) { err.textContent = 'Give a reason of at least three words.'; return; }
      void act(() => o.client.gate(s.id, drafts.choice, drafts.reason), check).then((next) => { if (next) { drafts.choice = ''; drafts.reason = ''; sigs.gate = ''; paintGate(next); } });
    });
    body.append(opts, el('label', 'rot-field'), check);
    (body.lastElementChild!.previousElementSibling as HTMLElement).append(el('span', '', 'Why? (at least three words)'), reason);
  }

  function paintWritten(st: RotationStatus, body: HTMLElement): void {
    const g = st.gates[s.id];
    const state = g?.state ?? 'open';
    const w = written!;
    const passage = el('p', 'rot-extract', w.passage);
    body.append(passage, el('p', '', ''), el('p', 'rot-small rot-muted', `${w.marks} mark${w.marks === 1 ? '' : 's'}. For each: name the technique, quote the exact words, and explain how it shows ${w.idea}.${w.different_techniques ? ' Use a different technique each time.' : ''}`));
    (body.children[1] as HTMLElement).append(el('b', '', w.prompt));
    const done = state === 'passed' || state === 'unlocked';
    const ta = el('textarea', 'rot-input');
    ta.rows = 7;
    ta.maxLength = 3000;
    ta.value = drafts.writing || g?.last?.text || '';
    if (!drafts.writing && g?.last?.text) drafts.writing = g.last.text;
    ta.setAttribute('aria-label', 'Your answer');
    ta.disabled = done;
    ta.addEventListener('input', () => { drafts.writing = ta.value; });
    body.append(ta);
    const row = el('div', 'rot-row');
    const check = el('button', 'rot-btn rot-btn--small rot-btn--primary', 'Check my writing');
    check.type = 'button';
    const left = g?.checks_left ?? w.max_checks;
    check.disabled = done || checking || state === 'flagged' || left <= 0;
    const tries = el('span', 'rot-small rot-muted', done ? '' : state === 'flagged' ? 'Your teacher will look at this one.' : `${left} check${left === 1 ? '' : 's'} before your teacher steps in`);
    const spin = el('span', 'rot-checking');
    spin.append(el('span', 'rot-spin'), document.createTextNode('Checking your writing…'));
    spin.hidden = !checking;
    check.addEventListener('click', () => {
      if (!drafts.writing.trim()) { err.textContent = 'Write your answer first.'; return; }
      checking = true;
      spin.hidden = false;
      check.disabled = true;
      void act(() => o.client.checkWriting(s.id, drafts.writing)).then((next) => {
        checking = false;
        spin.hidden = true;
        sigs.gate = '';
        if (next) paintGate(next);
        else check.disabled = false;
      });
    });
    row.append(check, tries);
    body.append(row, spin);
    const last = g?.last;
    if (last) {
      const result = el('div', 'rot-grid');
      result.setAttribute('aria-live', 'polite');
      result.style.gap = '8px';
      result.append(el('p', 'rot-small', last.outcome === 'passed' ? `All there: ${last.passed} of ${last.need} needed. The rest is open.` : last.outcome === 'teacher' ? 'Your teacher will look at this one.' : `${last.passed} of ${last.need} points there so far.`));
      last.points.forEach((p, i) => {
        const card = el('div', 'rot-wg-point');
        card.dataset.pass = String(p.passed);
        card.append(el('b', '', `Point ${i + 1}${p.passed ? ' · there' : ''}`));
        const ul = el('ul', 'rot-checks');
        ul.style.margin = '4px 0 0';
        ul.style.paddingLeft = '18px';
        for (const c of p.checks) if (c.ok !== null) ul.append(el('li', '', `${c.ok ? '✓' : '✗'} ${WRITTEN_CHECK_LABELS[c.check]}`));
        card.append(ul);
        result.append(card);
      });
      if (last.feedback.length) {
        const fb = el('ul', 'rot-small');
        fb.style.margin = '0';
        for (const line of last.feedback) fb.append(el('li', '', line));
        result.append(fb);
      }
      if (!done && last.outcome !== 'passed') {
        if (g?.appeal_at) result.append(el('p', 'rot-note', 'Sent to your teacher. The checker’s verdict stands until they decide.'));
        else {
          const appeal = el('button', 'rot-link', 'I think the checker got this wrong');
          appeal.type = 'button';
          appeal.addEventListener('click', () => void act(() => o.client.appeal(s.id)).then((next) => { if (next) { sigs.gate = ''; paintGate(next); } }));
          result.append(appeal);
        }
      }
      if (g?.teacher) result.append(el('p', 'rot-note', g.teacher.decision === 'pass' ? 'Your teacher passed this.' : 'Your teacher kept this closed. Have another go.'));
      body.append(result);
    }
    body.append(el('p', 'rot-note', 'The checker tells you which point needs work and why. It won’t rewrite your answer. Practice only: never a mark.'));
  }

  function paintGate(st: RotationStatus): void {
    if (!hasGate) return;
    const g = st.gates[s.id];
    const open = g?.state === 'passed' || g?.state === 'unlocked';
    const sig = JSON.stringify([g, checking]);
    if (sigs.gate !== sig) {
      sigs.gate = sig;
      const { box, body } = sect('rot-sect--gate', 'Check before you go on', (() => { const c = el('span', 'rot-chip rot-chip--gold', 'Opens the rest'); return c; })());
      box.dataset.state = g?.state ?? 'open';
      if (hinge) paintHinge(st, body);
      else paintWritten(st, body);
      gateBox.replaceChildren(box);
    }
    gated.dataset.open = String(open);
    if (open) inner.removeAttribute('inert'); else inner.setAttribute('inert', '');
    inner.setAttribute('aria-hidden', String(!open));
    veil.hidden = open;
  }

  // ---- after the gate, done when, exit check, collect
  const afterBox = el('div', 'rot-grid');
  const exitBox = el('div');
  const collectBox = el('div');
  function paintAfter(st: RotationStatus): void {
    const g = st.gates[s.id];
    const open = !hasGate || g?.state === 'passed' || g?.state === 'unlocked';
    const sig = JSON.stringify([level, open]);
    if (sigs.after === sig) return;
    sigs.after = sig;
    afterBox.replaceChildren();
    // Hidden blocks aren't built at all until the gate opens; blurred ones sit under the veil, inert.
    const keep = (b: Block) => open || gateViewOf(b) !== 'hidden';
    const after = forLevel(byRole('after'), level ?? 'core').filter(keep);
    if (after.length) { const { box, body } = sect('', 'Next'); body.append(blockList(after)); afterBox.append(box); }
    const done = byRole('done').filter(keep);
    if (done.length) { const { box, body } = sect('', 'Done when'); body.append(blockList(done)); afterBox.append(box); }
  }
  function paintExit(st: RotationStatus): void {
    const exits = [...byRole('exit').filter((b) => b.block_type === 'quiz_question'), ...(hasLocks ? lockExitBlocks(s, st, o.blocks) : [])];
    const g = st.gates[s.id];
    const open = !hasGate || g?.state === 'passed' || g?.state === 'unlocked';
    const results = st.work?.results[s.id] ?? {};
    const hiddenUntilOpen = exits.some((b) => gateViewOf(b) === 'hidden') && !open;
    const sig = JSON.stringify([open, Object.keys(results), hiddenUntilOpen, exits.map((b) => b.id)]);
    if (sigs.exit !== sig) {
      sigs.exit = sig;
      exitBox.replaceChildren();
      if (exits.length && !hiddenUntilOpen) {
        const { box, body } = sect('', 'Exit check · just you');
        exits.forEach((b) => body.append(marked((b.content as { question: PublicQuestion }).question, results[b.id], (r) => void act(() => o.client.exit(s.id, b.id, r)), `exit:${b.id}`, drafts.exits[`exit:${b.id}`])));
        exitBox.append(box);
      }
    }
    const answered = exits.every((b) => results[b.id]);
    const collected = st.work?.collected.includes(s.id) ?? false;
    if (hasLocks) { paintComplete(st, answered && open, collected); return; }
    const csig = JSON.stringify([answered, collected, open]);
    if (sigs.collect === csig) return;
    sigs.collect = csig;
    const card = el('div', 'rot-collect');
    card.dataset.locked = String(!collected);
    const tok = el('div', 'rot-collect__tok', collected ? s.token || '✓' : '?');
    const text = el('div');
    if (collected) text.append(el('b', '', 'Collected'), el('br'), el('span', 'rot-small', s.piece || 'Your evidence card is on your board.'));
    else if (answered && open) {
      text.append(el('b', '', 'Collect your piece'), el('br'), el('span', 'rot-small', `Your evidence card${s.token ? ' and this station’s letter go' : ' goes'} onto your board.`));
      const b = el('button', 'rot-btn rot-btn--small', 'Collect');
      b.type = 'button';
      b.addEventListener('click', () => void act(() => o.client.collect(s.id), b));
      text.append(el('br'), b);
    } else text.append(el('b', '', 'Answer the exit check to collect'), el('br'), el('span', 'rot-small', 'Your evidence card goes onto your board.'));
    card.append(tok, text);
    collectBox.replaceChildren(card);
  }

  // ---- station complete (stations with locks): a full-width panel in place of the small collect card
  function paintComplete(st: RotationStatus, ready: boolean, collected: boolean): void {
    const passed = allLocksPassed(s, st);
    const kit = kitFor(st, s.id);
    const sig = JSON.stringify([passed, ready, collected, kit.map((k) => k.lock)]);
    if (sigs.complete === sig) return;
    sigs.complete = sig;
    if (!passed && !collected) { completeBox.replaceChildren(); return; }
    const panel = el('section', 'rot-complete');
    panel.dataset.collected = String(collected);
    const tok = el('div', 'rot-complete__tok', collected ? s.token || '✓' : '✓');
    tok.setAttribute('aria-hidden', 'true');
    const head = el('div', 'rot-complete__head');
    const words = el('div');
    words.append(el('h2', '', collected ? 'Station complete' : 'All locks open'));
    if (collected) words.append(el('p', 'rot-complete__piece', s.piece || 'Your evidence card is on your board.'));
    else if (ready) words.append(el('p', '', `Collect this station to put its piece${s.token ? ' and letter' : ''} on your board.`));
    else words.append(el('p', '', 'Answer the exit check above, then collect this station.'));
    head.append(tok, words);
    panel.append(head);
    if (kit.length) {
      panel.append(el('p', 'rot-eyebrow', 'Your Viva Kit cards from this station'));
      const cards = el('div', 'rot-kit-list rot-kit-list--wide');
      for (const k of kit) cards.append(kitCard(k));
      panel.append(cards);
    }
    const row = el('div', 'rot-row');
    if (collected) {
      const back = el('button', 'rot-btn rot-btn--primary', 'Back to the map');
      back.type = 'button';
      back.addEventListener('click', o.onBack);
      row.append(back);
    } else {
      const b = el('button', 'rot-btn rot-btn--primary', 'Collect this station');
      b.type = 'button';
      b.disabled = !ready;
      b.addEventListener('click', () => void act(() => o.client.collect(s.id), b));
      row.append(b);
    }
    panel.append(row);
    (o.keepScroll ?? ((swap: () => void) => swap()))(() => completeBox.replaceChildren(panel));
  }

  function paintKit(st: RotationStatus): void {
    if (!hasLocks) return;
    const kit = kitFor(st, s.id);
    const sig = JSON.stringify(kit.map((k) => k.lock));
    if (sigs.kit === sig) return;
    sigs.kit = sig;
    kitBox.hidden = false;
    kitBox.replaceChildren(el('p', 'rot-eyebrow', 'Your Viva Kit · this station'));
    if (!kit.length) { kitBox.append(el('p', 'rot-note', 'Open a lock to earn a card. Your cards stay with you for the viva.')); return; }
    const list = el('div', 'rot-kit-list');
    for (const k of kit) list.append(kitCard(k));
    kitBox.append(list);
  }

  // ---- the side panel
  function paintAside(st: RotationStatus): void {
    const info = st.levels[s.id];
    const sig = JSON.stringify([info, st.seats[s.id] ?? 0, st.work?.hand_up_at, s.kind]);
    if (sigs.aside === sig) return;
    sigs.aside = sig;
    about.replaceChildren(el('p', 'rot-eyebrow', 'This station'));
    about.append(el('p', 'rot-small', `${s.minutes} min · ${s.seats} seats${st.seats[s.id] ? ` (${st.seats[s.id]} here now)` : ''}${s.location ? ` · ${s.location}` : ''}`));
    const chips = el('div', 'rot-chips');
    chips.append(el('span', 'rot-chip rot-chip--sage', ROTATION_KIND_INFO[s.kind].label));
    if (s.strand) chips.append(el('span', 'rot-chip rot-chip--lilac', s.strand.charAt(0).toUpperCase() + s.strand.slice(1)));
    about.append(chips);
    if (s.kind !== 'teacher' && info) {
      const p = el('p', 'rot-small');
      p.append(document.createTextNode('Your level here is '), el('b', '', ROTATION_LEVEL_LABELS[info.level]));
      const pre = st.pretest.items.filter((i) => i.station === s.id);
      const right = pre.filter((i) => st.pretest.results[i.id]?.mark.correct).length;
      p.append(document.createTextNode(info.source === 'pretest' ? `: you got ${right} of ${pre.length} on the pretest.` : info.source === 'own' ? ': you changed it.' : ': the pretest isn’t finished, so you start at Core.'));
      if (o.rotation.dial !== 'guided') p.append(document.createTextNode(' You can change it.'));
      about.append(p);
    }
    help.replaceChildren(el('p', 'rot-eyebrow', 'Need a hand?'), el('p', 'rot-small', 'Try the hints first. Then put up a hand and you’ll join the queue.'));
    const up = !!st.work?.hand_up_at;
    const hand = el('button', 'rot-btn rot-btn--small', up ? 'Hand down' : 'Hand up');
    hand.type = 'button';
    hand.setAttribute('aria-pressed', String(up));
    hand.addEventListener('click', () => void act(() => o.client.hand(!up), hand));
    help.append(hand);
    if (up) help.append(el('p', 'rot-feedback', 'Your hand is up. Your teacher will come to you.'));
    if (s.has_offline_code && !st.work?.collected.includes(s.id)) {
      const code = el('input', 'rot-input');
      code.maxLength = 20;
      code.value = drafts.code;
      code.setAttribute('aria-label', 'Station code');
      code.addEventListener('input', () => { drafts.code = code.value; });
      const go = el('button', 'rot-btn rot-btn--small', 'Mark done');
      go.type = 'button';
      go.addEventListener('click', () => void act(() => o.client.offline(s.id, drafts.code), go));
      const off = el('div', 'rot-panel');
      off.append(el('p', 'rot-eyebrow', 'Done this station on paper?'), el('label', 'rot-field'), go);
      (off.children[1] as HTMLElement).append(el('span', '', 'Type the code from the station'), code);
      help.after(off);
    }
  }

  const chain = hasLocks ? mountLockChain({
    station: s,
    lessonId: o.lessonId,
    blocks: o.blocks,
    render,
    client: o.client,
    act,
    quiet: async (go) => { try { return await o.run(go); } catch { return null; } },
    ...(o.keepScroll ? { keepScroll: o.keepScroll } : {}),
    onAllOpen: () => window.setTimeout(() => (completeBox.firstElementChild ?? exitBox).scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 420)
  }) : null;
  // A station with locks shows its steps box only when it has plain steps or hints of its own.
  const plainSteps = !hasLocks || byRole('step').length > 0 || byRole('hint').length > 0;
  steps.append(recallBox, goalBox);
  if (plainSteps) steps.append(stepsBox);
  if (chain) steps.append(chain.root);
  if (s.kind !== 'teacher') {
    const end = hasLocks ? [afterBox, exitBox] : [afterBox, exitBox, collectBox];
    if (hasGate) {
      inner.append(...end);
      steps.append(gateBox, gated);
    } else steps.append(...end);
  } else {
    steps.append(el('p', 'rot-note', 'Your teacher runs this station. Go back to the map when you are done.'));
  }

  return {
    root,
    update(next: RotationStatus): void {
      status = next;
      paintRecall(status);
      paintSteps(status);
      if (s.kind === 'teacher') { paintAside(status); return; }
      chain?.update(status);
      paintKit(status);
      paintGate(status);
      paintAfter(status);
      paintExit(status);
      paintAside(status);
    },
    dispose(): void { chain?.dispose(); }
  };
}
