// packages/change-book/render/attribution.ts
// (Un)Happiness's chart (family attribution), in the worksheet's shape. Above: the feeling word
// (happy, rich, lonely or the person's own), then two circles, now (1) and in three years (3),
// each with its 1–5 rating and, under it, the arrow's answer: what got the person here, what will
// get them there. Below: the table, influence now (2) | force | influence in three years (4), each
// cell five dots to tap. A force whose influence moves between the columns carries an up or down
// mark. The person's own forces join the table as rows. Save sends one snapshot; a summary line
// says how many of every 10 influence points go to the person's own thoughts and actions.
// Phone: each force's name sits above its two dot rows; every dot is a 32px target.
import { FEELINGS, RANGE, drift, forcesOf, latestAttribution, selfWords } from '../families/attribution.mjs';
import { type ChartView, type DmToolRun, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName } from '../../decision-book/render/core';

type Force = { id: string; label: string; self?: boolean };
type TableForce = { id: string; label: string; own: boolean };
type Snapshot = { at?: string; feeling: string; now: number; later: number; influenceNow: Record<string, number>; influenceLater: Record<string, number> };
export type AttributionTool = { name: string; slots: Record<string, string>; chart: { forces: Force[] } };

const [LOW, HIGH] = RANGE as [number, number];
const POINTS = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i);

/** Labels that carry the feeling word. */
export const feelingWords = (feeling: string) => ({
  now: `How ${feeling} are you now?`,
  later: `In three years, how ${feeling} do you expect to be?`,
  influenceNow: `Influence on how ${feeling} you are now`,
  influenceLater: `influence on how ${feeling} you will be in three years`
});

let counter = 0;

/** A row of five radio dots, 1 to 5, named for what they rate. */
function dots(doc: Document, name: string, label: string, onPick: () => void): { group: HTMLDivElement; get(): number | null; set(n: number | null): void; relabel(words: string): void } {
  const group = el(doc, 'div', 'ch-at__dots');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  let picked: number | null = null;
  const inputs = POINTS.map((n) => {
    const item = el(doc, 'label', 'ch-at__dot');
    const input = el(doc, 'input', 'ch-at__dot-input');
    input.type = 'radio';
    input.name = name;
    input.value = String(n);
    input.setAttribute('aria-label', String(n));
    input.addEventListener('change', () => {
      if (!input.checked) return;
      picked = n;
      group.setAttribute('data-value', String(n));
      onPick();
    });
    item.append(input, el(doc, 'span', 'ch-at__dot-mark', String(n)));
    group.append(item);
    return input;
  });
  return {
    group,
    get: () => picked,
    set: (n) => {
      picked = n;
      for (const input of inputs) input.checked = Number(input.value) === n;
      group.setAttribute('data-value', n == null ? '' : String(n));
    },
    relabel: (words) => setAttr(group, 'aria-label', words)
  };
}

export function createAttributionView(tool: AttributionTool, doc: Document = document): ChartView {
  const { chart } = tool;
  const uid = `ch-at-${(counter += 1)}`;
  const selfIds = chart.forces.filter((f) => f.self).map((f) => f.id);
  let built = false;
  let emit: (payload: Record<string, unknown>) => void = () => {};
  let applied = '';
  let feeling = 'happy';

  const top = el(doc, 'div', 'ch-at__top');
  const feelingBox = el(doc, 'fieldset', 'ch-at__feeling');
  const ownWord = el(doc, 'input', 'ch-at__own-word');
  const circles = { now: el(doc, 'div', 'ch-at__circle ch-at__circle--now'), later: el(doc, 'div', 'ch-at__circle ch-at__circle--later') };
  const numbers = { now: el(doc, 'span', 'ch-at__number', '–'), later: el(doc, 'span', 'ch-at__number', '–') };
  const asks = { now: el(doc, 'span', 'ch-at__ask'), later: el(doc, 'span', 'ch-at__ask') };
  const arrows = { got_here: el(doc, 'div', 'ch-at__arrow ch-at__arrow--got'), get_there: el(doc, 'div', 'ch-at__arrow ch-at__arrow--get') };
  const table = el(doc, 'div', 'ch-at__table');
  const heads = { now: el(doc, 'span', 'ch-at__col ch-at__col--now'), later: el(doc, 'span', 'ch-at__col ch-at__col--later') };
  const summary = el(doc, 'p', 'ch-at__summary');
  summary.setAttribute('aria-live', 'polite');
  const status = el(doc, 'p', 'ch-at__status');
  status.setAttribute('role', 'status');
  const picks: Partial<Record<'now' | 'later', ReturnType<typeof dots>>> = {};
  const rows = new Map<string, { row: HTMLDivElement; name: HTMLDivElement; pill: HTMLDivElement; label: HTMLSpanElement; mark: HTMLSpanElement; now: ReturnType<typeof dots>; later: ReturnType<typeof dots>; notes: HTMLDivElement }>();
  const feelingInputs: HTMLInputElement[] = [];

  function setFeeling(word: string): void {
    feeling = word;
    const words = feelingWords(word);
    setText(asks.now, words.now);
    setText(asks.later, words.later);
    picks.now?.relabel(words.now);
    picks.later?.relabel(words.later);
    setText(heads.now, '② Now');
    setText(heads.later, '④ In three years');
    for (const [, row] of rows) {
      const force = row.row.getAttribute('aria-label') ?? '';
      row.now.relabel(`${force}: ${words.influenceNow}`);
      row.later.relabel(`${force}: ${words.influenceLater}`);
    }
  }

  /** The feeling choice picked (happy, rich, lonely or own), kept apart from the radios' checked state. */
  let choice = 'happy';
  function pickedFeeling(): string {
    return choice === 'own' ? ownWord.value.trim().toLowerCase() : choice;
  }

  function buildTop(): void {
    feelingBox.append(el(doc, 'legend', 'ch-at__feeling-legend', 'The feeling'));
    const choices = el(doc, 'div', 'ch-at__choices');
    for (const word of [...FEELINGS, 'own']) {
      const label = el(doc, 'label', 'ch-at__choice');
      const input = el(doc, 'input', 'ch-at__choice-input');
      input.type = 'radio';
      input.name = `${uid}-feeling`;
      input.value = word;
      input.checked = word === 'happy';
      input.addEventListener('change', () => {
        if (!input.checked) return;
        choice = input.value;
        ownWord.hidden = input.value !== 'own';
        if (input.value === 'own') ownWord.focus();
        const word2 = pickedFeeling();
        if (word2) setFeeling(word2);
      });
      feelingInputs.push(input);
      label.append(input, el(doc, 'span', 'ch-at__choice-mark', word === 'own' ? 'Your own word' : word));
      choices.append(label);
    }
    ownWord.type = 'text';
    ownWord.maxLength = 24;
    ownWord.hidden = true;
    ownWord.setAttribute('aria-label', 'Your own feeling word');
    ownWord.placeholder = 'e.g. calm';
    ownWord.addEventListener('input', () => {
      const word = ownWord.value.trim().toLowerCase();
      if (word) setFeeling(word);
    });
    feelingBox.append(choices, ownWord);

    const pair = el(doc, 'div', 'ch-at__pair');
    for (const [key, n, arrowKey, caption] of [['now', '①', 'got_here', 'What has got you to this point?'], ['later', '③', 'get_there', 'What will get you to that point?']] as const) {
      const side = el(doc, 'div', `ch-at__side ch-at__side--${key}`);
      const circle = circles[key];
      circle.setAttribute('aria-hidden', 'true');
      circle.append(el(doc, 'span', 'ch-at__circle-n', n), numbers[key]);
      const pick = dots(doc, `${uid}-${key}`, '', refreshSummary);
      const ask = el(doc, 'div', 'ch-at__rate');
      ask.append(asks[key], pick.group);
      const arrow = arrows[arrowKey];
      arrow.setAttribute('role', 'group');
      arrow.setAttribute('aria-label', caption);
      arrow.append(el(doc, 'span', 'ch-at__arrow-caption', caption));
      side.append(circle, ask, arrow);
      pair.append(side);
      picks[key] = pick;
    }
    top.append(feelingBox, pair);
  }

  function buildTable(): void {
    const head = el(doc, 'div', 'ch-at__head');
    head.setAttribute('aria-hidden', 'true');
    head.append(heads.now, el(doc, 'span', 'ch-at__col ch-at__col--force', 'Driving forces'), heads.later);
    table.append(head);
  }

  function addRow(force: TableForce): void {
    const row = el(doc, 'div', 'ch-at__row');
    row.setAttribute('role', 'group');
    row.setAttribute('data-force', force.id);
    if (force.own) row.setAttribute('data-own', '');
    const name = el(doc, 'div', 'ch-at__force');
    const pill = el(doc, 'div', 'ch-at__own');
    const label = el(doc, 'span', 'ch-at__force-label', force.own ? '' : force.label);
    const mark = el(doc, 'span', 'ch-at__drift');
    const notes = el(doc, 'div', 'ch-at__notes');
    name.append(pill, label, mark, notes);
    const now = dots(doc, `${uid}-${force.id}-now`, '', refreshSummary);
    const later = dots(doc, `${uid}-${force.id}-later`, '', refreshSummary);
    now.group.classList.add('ch-at__dots--now');
    later.group.classList.add('ch-at__dots--later');
    // On a phone the two dot rows stack under the force: each carries its column's number.
    for (const [group, n] of [[now.group, '②'], [later.group, '④']] as const) {
      const tag = el(doc, 'span', 'ch-at__dots-tag', n);
      tag.setAttribute('aria-hidden', 'true');
      group.prepend(tag);
    }
    row.append(now.group, name, later.group);
    table.append(row);
    rows.set(force.id, { row, name, pill, label, mark, now, later, notes });
  }

  /** The draft from the form, or null with a reason. */
  function draft(forces: TableForce[]): { payload: Snapshot } | { problem: string } {
    const word = pickedFeeling();
    if (!word) return { problem: 'Write your own feeling word, or pick happy, rich or lonely.' };
    const now = picks.now!.get();
    const later = picks.later!.get();
    if (now == null || later == null) return { problem: `Rate how ${word} you are now and in three years, 1 to 5.` };
    const influenceNow: Record<string, number> = {};
    const influenceLater: Record<string, number> = {};
    for (const f of forces) {
      const row = rows.get(f.id)!;
      const a = row.now.get();
      const b = row.later.get();
      if (a == null || b == null) return { problem: `Rate every force in both columns: ${f.label} is still open.` };
      influenceNow[f.id] = a;
      influenceLater[f.id] = b;
    }
    return { payload: { feeling: word, now, later, influenceNow, influenceLater } };
  }

  let currentForces: TableForce[] = [];
  let saved: Snapshot | null = null;

  /** The summary, from the saved snapshot, or from the draft once every dot is set. */
  function refreshSummary(): void {
    const ids = currentForces.map((f) => f.id);
    const d = draft(currentForces);
    const snap = 'payload' in d ? d.payload : saved;
    setText(summary, (snap && selfWords(snap, selfIds, ids)) ?? 'Rate every force in both columns to see how much of the feeling you put down to yourself.');
  }

  const save = el(doc, 'button', 'ch-at__save', 'Save the table');
  save.type = 'button';
  save.addEventListener('click', () => {
    const d = draft(currentForces);
    if ('problem' in d) {
      setText(status, d.problem);
      return;
    }
    setText(status, '');
    emit(d.payload as unknown as Record<string, unknown>);
  });

  return createChart({
    family: 'attribution',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      emit = ctx.emitScore;
      if (!built) {
        buildTop();
        buildTable();
        const foot = el(doc, 'div', 'ch-at__foot');
        foot.append(save, summary);
        ctx.frame.append(top, table, foot, status);
        setFeeling('happy');
        built = true;
      }
      const forces = forcesOf(run, chart) as TableForce[];
      currentForces = forces;
      for (const id of [...rows.keys()]) if (!forces.some((f) => f.id === id)) {
        rows.get(id)!.row.remove();
        rows.delete(id);
      }
      for (const f of forces) if (!rows.has(f.id)) addRow(f);
      // Rows in table order (an own force can arrive after a save).
      for (const f of forces) table.append(rows.get(f.id)!.row);
      for (const f of forces) {
        const row = rows.get(f.id)!;
        if (!f.own) setText(row.label, f.label);
        row.row.setAttribute('aria-label', f.label);
        row.label.hidden = f.own;
      }
      setFeeling(feeling);

      saved = latestAttribution(run) as Snapshot | null;
      const key = saved ? JSON.stringify(saved) : '';
      if (saved && key !== applied) {
        applied = key;
        const own = !FEELINGS.includes(saved.feeling);
        choice = own ? 'own' : saved.feeling;
        for (const input of feelingInputs) input.checked = input.value === choice;
        ownWord.hidden = !own;
        if (own) ownWord.value = saved.feeling;
        setFeeling(saved.feeling);
        picks.now!.set(saved.now);
        picks.later!.set(saved.later);
        for (const f of forces) {
          const row = rows.get(f.id)!;
          row.now.set(saved.influenceNow[f.id] ?? null);
          row.later.set(saved.influenceLater[f.id] ?? null);
        }
      }
      setText(numbers.now, saved ? String(saved.now) : '–');
      setText(numbers.later, saved ? String(saved.later) : '–');
      for (const f of forces) {
        const row = rows.get(f.id)!;
        const way = drift(saved, f.id) as 'up' | 'down' | 'same' | null;
        setAttr(row.row, 'data-drift', way);
        setText(row.mark, way === 'up' ? '↑' : way === 'down' ? '↓' : '');
        setAttr(row.mark, 'aria-label', way === 'up' ? 'more influence in three years' : way === 'down' ? 'less influence in three years' : null);
        setAttr(row.mark, 'role', way === 'up' || way === 'down' ? 'img' : null);
      }
      refreshSummary();

      const specs: EntrySpec[] = [];
      for (const node of run.nodes) {
        const name = slotName(node);
        if (name === 'got_here' || name === 'get_there') specs.push({ node, host: arrows[name], fill: name === 'got_here' ? 'green' : 'red', label: name === 'got_here' ? 'What has got you to this point' : 'What will get you to that point' });
        else if (name === 'force') {
          const id = `own_${slotIndex(node) || 1}`;
          const row = rows.get(id);
          if (row) specs.push({ node, host: row.pill, fill: 'ink', label: `Your own force ${slotIndex(node) || 1}`, order: -1 });
        } else if (name === 'note' && rows.has(node.tag ?? '')) {
          const f = forces.find((x) => x.id === node.tag)!;
          specs.push({ node, host: rows.get(f.id)!.notes, fill: 'tint', label: `Note ${slotIndex(node)} on ${f.label}` });
        }
      }
      return specs;
    }
  }, doc);
}
