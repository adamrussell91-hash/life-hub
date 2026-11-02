// The Check-in side panel: five step cards you can jump between, side cards behind "What's going on?",
// a quiet safety sheet behind ⋯, and a handover record that is sealed on the server when saved.
// Adam drives; nothing is kept until Save. Wording comes from the private repo and is never stored here.
// Approved mockup: docs/mockups/check-in/check-in.html. Motion: check-in.css (reduced motion respected).
import { loadCheckInText as defaultLoadText } from './api';
import { CHECK_IN_ICONS, emblemEl, iconEl, type CheckInIcon } from './icons';
import { forHandover, hasContent, newCheckIn, reportMayBeNeeded, toggle, withSide } from './model';
import { CHECK_IN_STEP_IDS, type CheckInRecord, type CheckInReport, type CheckInSafety, type CheckInStepText, type CheckInText } from './types';

export interface CheckInPanelOptions {
  meetingId: string;
  /** People this can be about: students in the room first (the caller decides). */
  about: Array<{ ref: string; name: string }>;
  onSave: (record: CheckInRecord, before: CheckInRecord | null) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  /** A saved record opens straight on the handover. */
  edit?: CheckInRecord;
  loadText?: () => Promise<CheckInText>;
  /** 'fade' when handed over from the Guides shelf, so the panel doesn't slide in twice. */
  entrance?: 'slide' | 'fade';
  now?: () => string;
  newId?: () => string;
}

type Dir = 'fwd' | 'back' | 'none';
const LEAVE_MS = 260;
const SAVED_HOLD_MS = 650;

export function openCheckInPanel(doc: Document, options: CheckInPanelOptions): { el: HTMLElement; close(): void } {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => `checkin_${crypto.randomUUID()}`);
  const win = doc.defaultView;
  const reduced = () => !win?.matchMedia || win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame = (fn: () => void) => (win?.requestAnimationFrame ? win.requestAnimationFrame(fn) : fn());

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (label: string, className: string, part?: string) => {
    const b = el('button', className, label);
    b.type = 'button';
    if (part) b.dataset.part = part;
    return b;
  };
  const kicker = (icon: CheckInIcon, label: string, extra = '') => {
    const k = el('div', `ci-kicker ${extra}`.trim());
    k.append(iconEl(doc, icon), el('span', undefined, label));
    return k;
  };

  // ---- Shell ----
  const panel = el('aside', 'guide-panel guide ci-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Check-in');
  panel.dataset.part = 'check-in-panel';
  const head = el('div', 'ci-head');
  const titleWrap = el('div', 'ci-head__title');
  const whoEl = el('span', 'ci-head__who');
  titleWrap.append(el('b', undefined, 'Check-in'), whoEl);
  const moreBtn = button('⋯', 'ci-more', 'check-in-more');
  moreBtn.setAttribute('aria-label', 'If they’re not safe right now');
  moreBtn.setAttribute('aria-haspopup', 'dialog');
  moreBtn.setAttribute('aria-expanded', 'false');
  const closeBtn = button('✕', 'btn btn--ghost ci-close', 'check-in-close');
  closeBtn.setAttribute('aria-label', 'Close check-in');
  head.append(emblemEl(doc, 'guide-emblem ci-emblem ci-emblem--head'), titleWrap, moreBtn, closeBtn);

  const pills = el('nav', 'ci-pills is-hidden');
  pills.setAttribute('aria-label', 'Steps');
  const glide = el('span', 'ci-pills__glide');
  pills.append(glide);
  const stage = el('div', 'ci-stage');
  stage.setAttribute('aria-live', 'polite');
  panel.append(head, pills, stage);
  doc.body.append(panel);
  if (!reduced()) {
    panel.classList.add(options.entrance === 'fade' ? 'is-entering-fade' : 'is-entering');
    frame(() => frame(() => panel.classList.remove('is-entering', 'is-entering-fade')));
  }

  // ---- State ----
  let text: CheckInText | null = null;
  let record: CheckInRecord | null = options.edit ? structuredClone(options.edit) : null;
  const before: CheckInRecord | null = options.edit ? structuredClone(options.edit) : null;
  let baseline = record ? JSON.stringify(record) : '';
  let stepAt = 0;
  let closed = false;
  let saving = false;
  let sheet: { el: HTMLElement; scrim: HTMLElement } | null = null;
  let confirmBar: HTMLElement | null = null;
  const opener = doc.activeElement as HTMLElement | null;

  // ---- Close ----
  function finish(): void {
    if (closed) return;
    closed = true;
    doc.removeEventListener('keydown', onKey);
    win?.removeEventListener('hashchange', finish);
    win?.removeEventListener('resize', placeGlide);
    const done = () => {
      panel.remove();
      if (opener && doc.contains(opener)) opener.focus();
    };
    if (reduced()) return done();
    panel.classList.add('is-leaving');
    win?.setTimeout(done, LEAVE_MS) ?? done();
  }
  const dirty = () => Boolean(record && !saving && JSON.stringify(record) !== baseline && hasContent(record));
  function requestClose(): void {
    if (closed) return;
    if (!dirty()) return finish();
    if (confirmBar) return;
    confirmBar = el('div', 'ci-confirm');
    confirmBar.setAttribute('role', 'alertdialog');
    confirmBar.setAttribute('aria-label', 'Close without saving?');
    const keep = button('Keep going', 'btn btn--ghost', 'check-in-keep');
    const drop = button('Close without saving', 'btn btn--secondary', 'check-in-discard');
    keep.addEventListener('click', dismissConfirm);
    drop.addEventListener('click', finish);
    confirmBar.append(el('span', undefined, 'Close without saving?'), keep, drop);
    panel.append(confirmBar);
    keep.focus();
  }
  function dismissConfirm(): void {
    const bar = confirmBar;
    confirmBar = null;
    if (!bar) return;
    if (reduced()) return bar.remove();
    bar.classList.add('is-leaving');
    win?.setTimeout(() => bar.remove(), 200);
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (sheet) return closeSheet(true);
    if (confirmBar) return dismissConfirm();
    const active = doc.activeElement;
    if ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.value) return;
    requestClose();
  }
  doc.addEventListener('keydown', onKey);
  win?.addEventListener('hashchange', finish);
  closeBtn.addEventListener('click', requestClose);

  // ---- The quiet safety sheet ----
  function openSheet(): void {
    if (sheet || !text) return;
    const scrim = el('div', 'ci-scrim');
    const box = el('div', 'ci-quiet');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', text.safety.title);
    box.dataset.part = 'check-in-quiet';
    box.append(el('h5', undefined, text.safety.title));
    const steps = el('ol');
    for (const s of text.safety.steps) steps.append(el('li', undefined, s));
    box.append(steps);
    if (text.safety.contacts.length) {
      const people = el('div', 'ci-quiet__people');
      for (const c of text.safety.contacts) {
        const row = el('div');
        row.append(el('b', undefined, c.role));
        if (c.how) row.append(el('span', undefined, ` · ${c.how}`));
        people.append(row);
      }
      box.append(people);
    }
    scrim.addEventListener('click', () => closeSheet(true));
    panel.append(scrim, box);
    sheet = { el: box, scrim };
    moreBtn.setAttribute('aria-expanded', 'true');
    moreBtn.classList.add('is-open');
    box.tabIndex = -1;
    box.focus({ preventScroll: true });
  }
  function closeSheet(refocus: boolean): void {
    const s = sheet;
    sheet = null;
    if (!s) return;
    moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.classList.remove('is-open');
    if (reduced()) { s.el.remove(); s.scrim.remove(); }
    else {
      s.el.classList.add('is-leaving');
      s.scrim.classList.add('is-leaving');
      win?.setTimeout(() => { s.el.remove(); s.scrim.remove(); }, 180);
    }
    if (refocus) moreBtn.focus();
  }
  moreBtn.addEventListener('click', () => (sheet ? closeSheet(true) : openSheet()));

  // ---- Screens ----
  function show(screen: HTMLElement, dir: Dir): void {
    screen.classList.add('ci-screen');
    const old = stage.querySelector<HTMLElement>('.ci-screen:not(.is-leaving)');
    if (old) {
      if (reduced() || dir === 'none') old.remove();
      else {
        old.classList.add('is-leaving', `is-leaving--${dir}`);
        old.setAttribute('aria-hidden', 'true');
        old.inert = true;
        let gone = false;
        const drop = () => { if (!gone) { gone = true; old.remove(); } };
        old.addEventListener('animationend', drop, { once: true });
        win?.setTimeout(drop, LEAVE_MS + 80);
      }
    }
    if (!reduced() && dir !== 'none') {
      screen.classList.add(`is-entering--${dir}`);
      screen.addEventListener('animationend', () => screen.classList.remove(`is-entering--${dir}`), { once: true });
    }
    stage.append(screen);
    stage.scrollTop = 0;
    const target = screen.querySelector<HTMLElement>('[tabindex="-1"]') ?? screen.querySelector<HTMLElement>('button:not([disabled]), input, textarea');
    target?.focus({ preventScroll: true });
  }

  function heading(textValue: string): HTMLElement {
    const h = el('h3', 'ci-ask', textValue);
    h.tabIndex = -1;
    return h;
  }

  function list(items: string[], className: string, ordered = false): HTMLElement {
    const ul = el(ordered ? 'ol' : 'ul', className);
    items.forEach((item, i) => {
      const li = el('li', undefined, item);
      li.style.setProperty('--i', String(i));
      ul.append(li);
    });
    return ul;
  }

  function pressable(label: string, on: boolean, className: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = button(label, `${className}${on ? ' is-on' : ''}`);
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => onClick(b));
    return b;
  }
  function setPressed(b: HTMLButtonElement, on: boolean): void {
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }

  function nav(back: { label: string; go: () => void } | null, next: HTMLButtonElement | null): HTMLElement {
    const row = el('div', 'ci-nav');
    if (back) {
      const b = button(back.label, 'btn btn--ghost', 'check-in-back');
      b.addEventListener('click', back.go);
      row.append(b);
    } else {
      row.append(el('span'));
    }
    if (next) row.append(next);
    return row;
  }

  // ---- Pills ----
  const pillButtons: HTMLButtonElement[] = [];
  function buildPills(): void {
    for (const [i, step] of text!.steps.entries()) {
      const b = button('', 'ci-pill', `check-in-pill-${step.id}`);
      b.append(iconEl(doc, step.id), el('span', undefined, step.title));
      b.addEventListener('click', () => goStep(i, i >= stepAt ? 'fwd' : 'back'));
      pillButtons.push(b);
      pills.append(b);
    }
    win?.addEventListener('resize', placeGlide);
  }
  function placeGlide(): void {
    const on = pillButtons[stepAt];
    if (!on) return;
    glide.style.width = `${on.offsetWidth}px`;
    glide.style.height = `${on.offsetHeight}px`;
    glide.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  }
  function paintPills(visible: boolean): void {
    pills.classList.toggle('is-hidden', !visible);
    pillButtons.forEach((b, i) => {
      const step = text!.steps[i]!;
      const seen = i < stepAt || Boolean(record?.lines[step.id]) || (step.id === 'safety' && record?.safety);
      b.classList.toggle('is-now', i === stepAt);
      b.classList.toggle('is-seen', Boolean(seen) && i !== stepAt);
      if (i === stepAt) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    frame(placeGlide);
  }

  // ---- Steps ----
  function goStep(index: number, dir: Dir): void {
    stepAt = index;
    paintPills(true);
    show(stepScreen(text!.steps[index]!), dir);
  }

  function lineField(stepId: CheckInStepText['id']): HTMLElement {
    const wrap = el('div', 'ci-line');
    const existing = record!.lines[stepId] ?? '';
    const toggleBtn = button('+ A short factual line', 'ci-line__add', `check-in-line-${stepId}`);
    const holder = el('div', 'ci-line__field');
    const inner = el('div');
    const input = el('input', 'guide-input');
    input.maxLength = 300;
    input.placeholder = 'Facts only. What they said or did.';
    input.setAttribute('aria-label', 'A short factual line');
    input.value = existing;
    input.addEventListener('input', () => {
      record!.lines = { ...record!.lines, [stepId]: input.value };
    });
    inner.append(input);
    holder.append(inner);
    const open = () => {
      wrap.classList.add('is-open');
      toggleBtn.hidden = true;
      input.focus({ preventScroll: true });
    };
    if (existing) { wrap.classList.add('is-open'); toggleBtn.hidden = true; }
    toggleBtn.addEventListener('click', open);
    wrap.append(toggleBtn, holder);
    return wrap;
  }

  function stepScreen(step: CheckInStepText): HTMLElement {
    const screen = el('div');
    screen.dataset.screen = `step-${step.id}`;
    const card = el('div', 'ci-card');
    card.append(kicker(step.id, step.title), heading(step.ask));
    if (step.hint) card.append(el('p', 'ci-hint', step.hint));
    if (step.say.length) card.append(el('div', 'ci-sub', 'You might say'), list(step.say, 'ci-say'));
    if (step.listen.length) card.append(el('div', 'ci-sub', 'Listen for'), list(step.listen, 'ci-say ci-say--listen'));

    if (step.id === 'safety') {
      card.append(el('div', 'ci-sub', 'Where you are now'));
      const two = el('div', 'ci-two');
      const none = pressable('No concern now', record!.safety === 'none', 'ci-choice', () => setSafety('none'));
      const concern = pressable('Some concern', record!.safety === 'concern', 'ci-choice ci-choice--dusk', () => {
        setSafety('concern');
        picker('fwd');
      });
      none.dataset.part = 'check-in-safety-none';
      concern.dataset.part = 'check-in-safety-concern';
      const setSafety = (value: CheckInSafety) => {
        record!.safety = record!.safety === value && value === 'none' ? null : value;
        setPressed(none, record!.safety === 'none');
        setPressed(concern, record!.safety === 'concern');
        paintPills(true);
      };
      two.append(none, concern);
      card.append(two);
    }

    if (step.id === 'help' && step.chips?.length) {
      for (const group of step.chips) {
        card.append(el('div', 'ci-sub', group.label));
        const chips = el('div', 'ci-chips');
        for (const item of group.items) {
          chips.append(pressable(item, record!.help.includes(item), 'ci-tick', (b) => {
            record!.help = toggle(record!.help, item);
            setPressed(b, record!.help.includes(item));
          }));
        }
        card.append(chips);
      }
    }
    screen.append(card);

    if (step.id === 'safety') {
      const row = el('div', 'ci-going');
      const going = button('What’s going on? →', 'ci-link', 'check-in-whats-going-on');
      going.addEventListener('click', () => picker('fwd'));
      row.append(going);
      for (const id of record!.sides) {
        const side = text!.sides.find((s) => s.id === id);
        if (!side) continue;
        const again = button(side.label, 'ci-tick ci-tick--side is-on');
        again.addEventListener('click', () => sideScreen(side.id, 'fwd'));
        row.append(again);
      }
      screen.append(row);
    }
    screen.append(lineField(step.id));

    const index = text!.steps.indexOf(step);
    const last = index === text!.steps.length - 1;
    const next = button(last ? 'Finish · Handover' : `Next · ${text!.steps[index + 1]!.title}`, 'btn btn--primary', last ? 'check-in-finish' : 'check-in-next');
    next.addEventListener('click', () => (last ? handover('fwd') : goStep(index + 1, 'fwd')));
    screen.append(nav(index > 0 ? { label: 'Back', go: () => goStep(index - 1, 'back') } : null, next));
    return screen;
  }

  // ---- Side cards ----
  const safetyIndex = () => CHECK_IN_STEP_IDS.indexOf('safety');
  function picker(dir: Dir): void {
    stepAt = safetyIndex();
    paintPills(true);
    const screen = el('div');
    screen.dataset.screen = 'picker';
    screen.append(kicker('side', 'What’s going on?', 'ci-kicker--dusk'), el('p', 'ci-hint', 'Open one if it fits. Back returns you to Safety.'));
    const pick = el('div', 'ci-pick');
    text!.sides.forEach((side, i) => {
      const b = button('', `ci-pick__item${record!.sides.includes(side.id) ? ' is-opened' : ''}`, `check-in-side-${side.id}`);
      b.style.setProperty('--i', String(i));
      b.append(el('span', undefined, side.label), el('span', 'ci-pick__go', '→'));
      b.addEventListener('click', () => sideScreen(side.id, 'fwd'));
      pick.append(b);
    });
    screen.append(pick, nav({ label: '← Back to Safety', go: () => goStep(safetyIndex(), 'back') }, null));
    show(screen, dir);
    screen.querySelector<HTMLElement>('.ci-kicker')!.tabIndex = -1;
    screen.querySelector<HTMLElement>('.ci-kicker')!.focus({ preventScroll: true });
  }

  function sideScreen(id: string, dir: Dir): void {
    const side = text!.sides.find((s) => s.id === id);
    if (!side) return;
    record = withSide(record!, id);
    const screen = el('div');
    screen.dataset.screen = `side-${id}`;
    const card = el('div', 'ci-card ci-card--side');
    card.append(kicker('side', side.label, 'ci-kicker--dusk'), heading(side.ask));
    if (side.hint) card.append(el('p', 'ci-hint', side.hint));
    card.append(list(side.steps, 'ci-steps', true));
    if (side.report) card.append(el('div', 'ci-flag', 'This may need a report. It’s on the handover.'));
    screen.append(card, nav({ label: '← Back', go: () => picker('back') }, null));
    show(screen, dir);
  }

  // ---- Handover ----
  function field(label: string, control: HTMLElement): HTMLElement {
    const f = el('div', 'ci-field');
    f.append(el('div', 'ci-field__label', label), control);
    return f;
  }

  function handover(dir: Dir): void {
    record = forHandover(record!);
    paintPills(false);
    const r = record;
    const screen = el('div');
    screen.dataset.screen = 'handover';
    const top = el('div', 'ci-card ci-card--handover');
    top.append(kicker('handover', 'Handover'), heading(`About ${r.person_name}`));

    // Safety
    const two = el('div', 'ci-two');
    const choices: Array<[Exclude<CheckInSafety, null>, string]> = [['none', 'No concern now'], ['concern', 'Some concern']];
    const safetyBtns = choices.map(([value, label]) => pressable(label, r.safety === value, `ci-choice${value === 'concern' ? ' ci-choice--dusk' : ''}`, () => {
      r.safety = r.safety === value ? null : value;
      safetyBtns.forEach((b, i) => setPressed(b, r.safety === choices[i]![0]));
    }));
    two.append(...safetyBtns);
    top.append(field('Safety', two));

    // Side cards
    if (text!.sides.length) {
      const chips = el('div', 'ci-chips');
      for (const side of text!.sides) {
        chips.append(pressable(side.label, r.sides.includes(side.id), 'ci-tick ci-tick--side', (b) => {
          r.sides = toggle(r.sides, side.id);
          setPressed(b, r.sides.includes(side.id));
          paintReport();
        }));
      }
      top.append(field('Side cards opened', chips));
    }

    // What was said
    const said = el('textarea', 'guide-input ci-textarea');
    said.maxLength = 2000;
    said.rows = 4;
    said.placeholder = 'Facts only. What they said, in their words where it matters.';
    said.value = r.said;
    said.setAttribute('aria-label', 'What was said');
    said.addEventListener('input', () => { r.said = said.value; });
    top.append(field('What was said', said));

    // Agreed help
    const helpStep = text!.steps.find((s) => s.id === 'help');
    const helpItems = [...new Set([...(helpStep?.chips ?? []).flatMap((g) => g.items), ...r.help])];
    if (helpItems.length) {
      const chips = el('div', 'ci-chips');
      for (const item of helpItems) {
        chips.append(pressable(item, r.help.includes(item), 'ci-tick', (b) => {
          r.help = toggle(r.help, item);
          setPressed(b, r.help.includes(item));
        }));
      }
      top.append(field('Agreed help', chips));
    }

    // Handed over to
    const handed = el('input', 'guide-input');
    handed.maxLength = 300;
    handed.placeholder = 'Who, and when';
    handed.value = r.handed_to;
    handed.setAttribute('aria-label', 'Handed over to');
    handed.addEventListener('input', () => { r.handed_to = handed.value; });
    top.append(field('Handed over to', handed));

    // Report
    const reportHost = el('div', 'ci-reveal');
    const reportInner = el('div');
    reportHost.append(reportInner);
    const reportChoices: Array<[Exclude<CheckInReport, null>, string]> = [['not_needed', 'Not needed'], ['to_do', 'To do'], ['made', 'Made']];
    const reportRow = el('div', 'ci-three');
    const reportBtns = reportChoices.map(([value, label]) => pressable(label, r.report === value, 'ci-choice', () => {
      r.report = r.report === value ? null : value;
      reportBtns.forEach((b, i) => setPressed(b, r.report === reportChoices[i]![0]));
    }));
    reportRow.append(...reportBtns);
    reportInner.append(field('Report', reportRow));
    reportHost.dataset.part = 'check-in-report';
    function paintReport(): void {
      const show = reportMayBeNeeded(r, text!) || r.report !== null;
      reportHost.classList.toggle('is-open', show);
      reportInner.inert = !show;
    }
    paintReport();
    top.append(reportHost);

    // Follow-ups
    if (text!.follow_ups.length) {
      const chips = el('div', 'ci-chips');
      const made = before?.follow_ups ?? [];
      for (const item of [...new Set([...text!.follow_ups, ...r.follow_ups])]) {
        const b = pressable(item, r.follow_ups.includes(item), 'ci-tick', (btn) => {
          r.follow_ups = toggle(r.follow_ups, item);
          setPressed(btn, r.follow_ups.includes(item));
        });
        if (made.includes(item)) { b.disabled = true; b.title = 'Task already made'; }
        chips.append(b);
      }
      top.append(field('Follow-ups → tasks', chips));
    }

    const lock = el('div', 'ci-lock');
    lock.append(iconEl(doc, 'lock'), el('span', undefined, 'Saved encrypted, apart from the meeting. Not sent to Clare, search or Notion.'));
    const error = el('p', 'guide-panel__error');
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const save = button('', 'btn btn--primary ci-save', 'check-in-save');
    const saveLabel = el('span', 'ci-save__label', 'Save');
    const saveDone = el('span', 'ci-save__done');
    saveDone.innerHTML = CHECK_IN_ICONS.check;
    saveDone.append(el('span', undefined, 'Saved'));
    save.append(saveLabel, saveDone);
    save.addEventListener('click', async () => {
      if (saving) return;
      saving = true;
      save.disabled = true;
      save.classList.add('is-busy');
      saveLabel.textContent = 'Saving…';
      error.hidden = true;
      const out: CheckInRecord = { ...r, said: r.said.trim(), handed_to: r.handed_to.trim(), updated_at: now(),
        lines: Object.fromEntries(Object.entries(r.lines).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v)) };
      try {
        await options.onSave(out, before);
        if (closed) return;
        record = out;
        baseline = JSON.stringify(out);
        save.classList.remove('is-busy');
        save.classList.add('is-saved');
        win?.setTimeout(finish, reduced() ? 0 : SAVED_HOLD_MS) ?? finish();
      } catch (e) {
        saving = false;
        save.disabled = false;
        save.classList.remove('is-busy');
        saveLabel.textContent = 'Save';
        error.textContent = e instanceof Error ? e.message : 'That didn’t save. Try again.';
        error.hidden = false;
      }
    });

    screen.append(top, lock, error);
    if (before && options.onDelete) {
      const del = button('Delete this check-in', 'ci-link ci-link--quiet', 'check-in-delete');
      del.addEventListener('click', async () => {
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1';
          del.textContent = 'Tap again to delete';
          return;
        }
        del.disabled = true;
        try {
          await options.onDelete!(before.id);
          baseline = JSON.stringify(record);
          finish();
        } catch (e) {
          del.disabled = false;
          error.textContent = e instanceof Error ? e.message : 'That didn’t delete.';
          error.hidden = false;
        }
      });
      screen.append(del);
    }
    screen.append(nav({ label: 'Back', go: () => goStep(text!.steps.length - 1, 'back') }, save));
    show(screen, dir);
  }

  // ---- Start ----
  function pickWho(): void {
    const screen = el('div');
    screen.dataset.screen = 'who';
    screen.append(heading('Who is this about?'));
    options.about.forEach((person, i) => {
      const b = button(person.name, 'guide-about ci-pick__item', `check-in-who-${i}`);
      b.style.setProperty('--i', String(i));
      b.addEventListener('click', () => begin(person));
      screen.append(b);
    });
    show(screen, 'none');
  }

  function begin(person: { ref: string; name: string }): void {
    record = newCheckIn({ id: newId(), meetingId: options.meetingId, personRef: person.ref, personName: person.name, now: now() });
    baseline = JSON.stringify(record);
    whoEl.textContent = ` · ${person.name}`;
    goStep(0, options.about.length > 1 ? 'fwd' : 'none');
  }

  function loading(): void {
    const screen = el('div', 'ci-loading');
    screen.setAttribute('aria-label', 'Loading');
    for (let i = 0; i < 4; i++) screen.append(el('span', 'ci-shimmer'));
    show(screen, 'none');
  }

  function failed(message: string): void {
    const screen = el('div');
    const retry = button('Try again', 'btn btn--secondary', 'check-in-retry');
    retry.addEventListener('click', start);
    screen.append(el('p', 'guide-panel__error', message), retry);
    show(screen, 'none');
  }

  async function start(): Promise<void> {
    loading();
    try {
      text = await (options.loadText ?? defaultLoadText)();
    } catch (e) {
      if (!closed) failed(e instanceof Error ? e.message : 'The check-in guide didn’t load.');
      return;
    }
    if (closed) return;
    if (!pillButtons.length) buildPills();
    if (record) {
      whoEl.textContent = ` · ${record.person_name}`;
      stepAt = text.steps.length - 1;
      handover('none');
      return;
    }
    if (!options.about.length) {
      const screen = el('div');
      screen.append(el('p', 'guide-panel__empty', 'Add them to In the room first, then start a check-in.'));
      show(screen, 'none');
      return;
    }
    if (options.about.length === 1) begin(options.about[0]!);
    else pickWho();
  }
  void start();

  return { el: panel, close: finish };
}
