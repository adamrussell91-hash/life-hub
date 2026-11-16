/**
 * Phase 2 · Observing. Lesson clock, the quick-key dock, the log, the tally against each descriptor with
 * the Observed / Partially / Not call, planned impact, and the Phase 2 write-up table.
 *
 * Keys (only while this view is mounted, and never while typing in another field): 1–4 pick the
 * descriptor, its look-for letters pick a look-for, + = > . ? / " ' pick the kind, Enter goes to the note
 * box and Enter there logs.
 */
import {
  addLogLineAt, clockLabel, clockMs, deleteLogEntry, editLogEntry, endClock, gatherWriteUp, logEntry, pauseClock, resumeClock, setLessonStart, startClock, tally
} from './model';
import type { Decision, LogEntry, LogKind, Observation, WriteUpRow } from './types';
import { DECISIONS, focusOf, h, KIND_KEYS, kindMeta, KINDS, NESA, slotClass, slotOf, syncValue, type ObsCtx, type ObsView } from './ui';

const emptyRow = (): WriteUpRow => ({ practice: '', strengths: '', decision: null, comments: '', edited: [] });

function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const t = target as HTMLElement;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/** Apply a log change, then refill write-up cells Adam hasn't edited. */
const withGather = (o: Observation): Observation => ({ ...o, write_up: gatherWriteUp(o) });

export function mountObserving(ctx: ObsCtx): ObsView {
  const { doc } = ctx;
  const el = h(doc, 'div', { class: 'obs-view obs-observing', 'data-part': 'obs-observing' });
  const sel: { code: string | null; look: string | null; kind: LogKind } = { code: null, look: null, kind: 'strength' };
  let tick: ReturnType<typeof setInterval> | null = null;
  let freshId: string | null = null;

  // ---------------------------------------------------------------- clock
  const clockRow = h(doc, 'div', { class: 'obs-row obs-clockrow', 'data-part': 'obs-clock' });
  const clockText = h(doc, 'span', { class: 'obs-clock', 'aria-label': 'Lesson clock' });

  function paintClock(): void {
    clockText.textContent = clockLabel(clockMs(ctx.obs(), ctx.now()));
  }

  function clockButton(label: string, part: string, fn: (o: Observation, now: Date) => Observation): HTMLButtonElement {
    const b = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--sm', 'data-part': part }, label);
    b.addEventListener('click', () => {
      ctx.change((o) => fn(o, ctx.now()), 'now');
      renderClock();
    });
    return b;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  /** Set when the lesson began by hand, e.g. when Start lesson was missed. Log times are redone to match. */
  function startTimeControl(): HTMLElement {
    const obs = ctx.obs();
    const started = obs.clock.started_at ? new Date(obs.clock.started_at) : null;
    const input = h(doc, 'input', { type: 'time', class: 'obs-input obs-input--time', 'data-part': 'obs-start-time', 'aria-label': 'Lesson started at' });
    input.value = started ? hhmm(started) : '';
    const set = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--sm', 'data-part': 'obs-start-set' }, started ? 'Change start' : 'Set start');
    const msg = h(doc, 'span', { class: 'obs-muted obs-small', 'aria-live': 'polite' });
    set.addEventListener('click', () => {
      const m = /^(\d{2}):(\d{2})$/.exec(input.value);
      if (!m) { msg.textContent = 'Pick a time first.'; return; }
      // The lesson's day: when it started, else its first log line, else today.
      const o = ctx.obs();
      const day = started ?? (o.log[0] ? new Date(o.log[0].at) : ctx.now());
      const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(m[1]), Number(m[2]), 0, 0);
      if (when.getTime() > ctx.now().getTime()) { msg.textContent = 'That time hasn’t happened yet.'; return; }
      ctx.change((x) => withGather(setLessonStart(x, when, ctx.now())), 'now');
      renderClock();
      renderLog();
      syncWriteUp();
    });
    return h(doc, 'span', { class: 'obs-row obs-starttime' }, h(doc, 'label', { class: 'obs-small' }, 'Started at ', input), set, msg);
  }

  function renderClock(): void {
    const obs = ctx.obs();
    const c = obs.clock;
    const running = !!c.started_at && !c.paused_at && !c.ended_at;
    const state = !c.started_at
      ? null
      : c.ended_at ? h(doc, 'span', { class: 'obs-rec is-ended' }, 'Lesson ended')
        : c.paused_at ? h(doc, 'span', { class: 'obs-rec is-paused' }, 'Paused')
          : h(doc, 'span', { class: 'obs-rec' }, h(doc, 'i', {}), 'Lesson running');
    const about = [obs.lesson.title, obs.teacher.name].filter(Boolean).join(' · ');
    const buttons = !c.started_at
      ? [clockButton('Start lesson', 'obs-clock-start', startClock)]
      : c.ended_at ? []
        : [c.paused_at ? clockButton('Resume', 'obs-clock-resume', resumeClock) : clockButton('Pause', 'obs-clock-pause', pauseClock),
          clockButton('End lesson', 'obs-clock-end', endClock)];
    paintClock();
    clockRow.replaceChildren(state ?? '', clockText, about ? h(doc, 'span', { class: 'obs-muted obs-small' }, `· ${about}`) : '', h(doc, 'span', { class: 'obs-spacer' }), startTimeControl(), ...buttons);
    if (running && !tick) tick = setInterval(paintClock, 1000);
    if (!running && tick) { clearInterval(tick); tick = null; }
  }

  // ---------------------------------------------------------------- dock
  const dock = h(doc, 'div', { class: 'obs-dock', 'data-part': 'obs-dock', role: 'group', 'aria-label': 'Quick log' });
  const dRow = h(doc, 'div', { class: 'obs-dock__row' });
  const lookRow = h(doc, 'div', { class: 'obs-dock__row', 'data-part': 'obs-dock-looks' });
  const kindRow = h(doc, 'div', { class: 'obs-dock__row' });
  const draft = h(doc, 'div', { class: 'obs-draftchips', 'aria-live': 'polite' });
  const note = h(doc, 'input', { type: 'text', class: 'obs-input', 'data-part': 'obs-note', 'aria-label': 'Note for the log line', placeholder: 'A few words (optional) · Enter to log', maxlength: 2000 });
  const logBtn = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--primary obs-btn--sm', 'data-part': 'obs-log-btn' }, 'Log');
  const transition = h(doc, 'button', { type: 'button', class: 'obs-key', 'data-part': 'obs-transition' }, '⏱ ', h(doc, 'span', { class: 'obs-key__long' }, 'Transition'));
  const n = ctx.obs().descriptors.length;
  dock.append(
    h(doc, 'div', { class: 'obs-dock__lbl' }, 'Descriptor', n ? h(doc, 'span', { class: 'obs-dock__hint' }, ` · keys 1–${n}`) : null),
    dRow,
    h(doc, 'div', { class: 'obs-dock__lbl obs-dock__lbl--looks' }, 'Look-for'),
    lookRow,
    h(doc, 'div', { class: 'obs-dock__lbl' }, 'Kind'),
    kindRow,
    draft,
    h(doc, 'div', { class: 'obs-compose' }, note, logBtn));

  function pickDescriptor(code: string | null): void {
    sel.code = sel.code === code ? null : code;
    sel.look = null;
    paintDock();
  }
  function pickLook(id: string): void {
    sel.look = sel.look === id ? null : id;
    paintDock();
  }
  function pickKind(kind: LogKind): void {
    sel.kind = kind;
    paintDock();
  }

  function paintDock(): void {
    const obs = ctx.obs();
    dRow.replaceChildren(...obs.descriptors.map((d, i) => {
      const b = h(doc, 'button', {
        type: 'button', class: `obs-key obs-key--d ${slotClass(i)}${sel.code === d.code ? ' is-on' : ''}`,
        'aria-pressed': String(sel.code === d.code), 'data-code': d.code, title: focusOf(d.code)
      }, h(doc, 'kbd', {}, String(i + 1)), d.code, h(doc, 'span', { class: 'obs-key__long obs-key__focus' }, focusOf(d.code)));
      b.addEventListener('click', () => pickDescriptor(d.code));
      return b;
    }));
    if (!obs.descriptors.length) dRow.append(h(doc, 'span', { class: 'obs-muted obs-small' }, 'No descriptors planned yet. Lines log as general lines.'));
    const d = obs.descriptors.find((x) => x.code === sel.code);
    const slot = slotOf(obs, sel.code);
    lookRow.replaceChildren(...(d?.look_fors ?? []).map((lf) => {
      const b = h(doc, 'button', {
        type: 'button', class: `obs-key obs-key--look ${slot}${sel.look === lf.id ? ' is-on' : ''}`,
        'aria-pressed': String(sel.look === lf.id), 'data-look': lf.id, title: lf.label
      }, lf.key ? h(doc, 'kbd', {}, lf.key) : null,
        h(doc, 'span', { class: 'obs-key__long' }, lf.label),
        h(doc, 'span', { class: 'obs-key__short' }, lf.label.split(/\s+/)[0] ?? lf.label));
      b.addEventListener('click', () => pickLook(lf.id));
      return b;
    }));
    if (!d) lookRow.append(h(doc, 'span', { class: 'obs-muted obs-small' }, sel.code ? 'No look-fors planned.' : 'Pick a descriptor to see its look-fors.'));
    kindRow.replaceChildren(...KINDS.map((k) => {
      const b = h(doc, 'button', {
        type: 'button', class: `obs-key obs-key--kind${sel.kind === k.kind ? ' is-on' : ''}`,
        'aria-pressed': String(sel.kind === k.kind), 'data-kind': k.kind, title: k.label
      }, h(doc, 'kbd', {}, k.key), h(doc, 'span', { class: 'obs-key__long' }, k.label), h(doc, 'span', { class: 'obs-key__short' }, k.short === k.key ? '' : k.short.slice(2)));
      b.addEventListener('click', () => pickKind(k.kind));
      return b;
    }), transition);
    const look = d?.look_fors.find((l) => l.id === sel.look);
    draft.replaceChildren(...[
      sel.code ? h(doc, 'span', { class: `obs-lk ${slot}` }, sel.code) : null,
      look ? h(doc, 'span', { class: `obs-lk ${slot}` }, look.label) : null,
      h(doc, 'span', { class: `obs-kind ${kindMeta(sel.kind).cls}` }, kindMeta(sel.kind).label)
    ].filter((x): x is HTMLSpanElement => x !== null));
  }

  function afterLog(): void {
    const latest = ctx.obs().log[ctx.obs().log.length - 1];
    freshId = latest?.id ?? null;
    renderLog();
    renderTally();
    syncWriteUp();
  }

  function logIt(kind: LogKind = sel.kind, asTransition = false): void {
    const text = note.value;
    ctx.change((o) => withGather(logEntry(o, asTransition
      ? { descriptor: null, look_for: null, kind: 'transition', text: text.trim() || 'Transition' }
      : { descriptor: sel.code, look_for: sel.code ? sel.look : null, kind, text }, ctx.now())), 'now');
    note.value = '';
    sel.look = null;
    paintDock();
    afterLog();
  }

  logBtn.addEventListener('click', () => logIt());
  transition.addEventListener('click', () => logIt(sel.kind, true));
  note.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); logIt(); }
    if (e.key === 'Escape') note.blur();
  });

  function onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target === note || isTyping(e.target)) return;
    const obs = ctx.obs();
    if (/^[1-9]$/.test(e.key)) {
      const d = obs.descriptors[Number(e.key) - 1];
      if (d) { e.preventDefault(); pickDescriptor(d.code); }
      return;
    }
    if (/^[a-z]$/i.test(e.key)) {
      const d = obs.descriptors.find((x) => x.code === sel.code);
      const lf = d?.look_fors.find((l) => l.key && l.key === e.key.toUpperCase());
      if (lf) { e.preventDefault(); pickLook(lf.id); }
      return;
    }
    const kind = KIND_KEYS[e.key];
    if (kind) { e.preventDefault(); pickKind(kind); return; }
    if (e.key === 'Enter') {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
      e.preventDefault();
      note.focus();
    }
  }
  doc.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- log
  const logCount = h(doc, 'span', { class: 'obs-count' });
  const logList = h(doc, 'ol', { class: 'obs-log', 'data-part': 'obs-log', reversed: true });
  const addMissed = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--xs', 'data-part': 'obs-log-add' }, '+ Add a missed line');
  const addHost = h(doc, 'div', { class: 'obs-log__addhost' });
  const logCard = h(doc, 'div', { class: 'obs-card obs-logcard' },
    h(doc, 'div', { class: 'obs-row obs-log__head' }, h(doc, 'h3', {}, 'Log', logCount), h(doc, 'span', { class: 'obs-spacer' }), addMissed),
    addHost, logList);

  type LineDraft = { clock: string; descriptor: string | null; look_for: string | null; kind: LogKind; text: string };

  /** One form for fixing a line or adding a missed one: time, descriptor, look-for, kind and words. */
  function lineForm(start: LineDraft, saveLabel: string, onSave: (d: LineDraft) => boolean, onCancel: () => void): HTMLElement {
    const obs = ctx.obs();
    const d: LineDraft = { ...start };
    const time = h(doc, 'input', { type: 'text', class: 'obs-input obs-lineform__time', 'data-field': 'clock', 'aria-label': 'Time in the lesson (mm:ss)', placeholder: 'mm:ss', inputmode: 'numeric', maxlength: 7 });
    time.value = d.clock;
    const desc = h(doc, 'select', { class: 'obs-input', 'data-field': 'descriptor', 'aria-label': 'Descriptor' },
      h(doc, 'option', { value: '' }, 'No descriptor'),
      ...obs.descriptors.map((x) => h(doc, 'option', { value: x.code }, `${x.code} ${focusOf(x.code)}`)));
    desc.value = d.descriptor ?? '';
    const look = h(doc, 'select', { class: 'obs-input', 'data-field': 'look_for', 'aria-label': 'Look-for' });
    const kind = h(doc, 'select', { class: 'obs-input', 'data-field': 'kind', 'aria-label': 'Kind' },
      ...KINDS.map((k) => h(doc, 'option', { value: k.kind }, k.label)),
      h(doc, 'option', { value: 'transition' }, '⏱ Transition'));
    kind.value = d.kind;
    const text = h(doc, 'input', { type: 'text', class: 'obs-input obs-lineform__text', 'data-field': 'text', 'aria-label': 'What happened', placeholder: 'What happened', maxlength: 2000 });
    text.value = d.text;
    const msg = h(doc, 'span', { class: 'obs-small obs-lineform__msg', 'aria-live': 'polite' });
    const save = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--primary obs-btn--xs', 'data-part': 'obs-line-save' }, saveLabel);
    const cancel = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--xs obs-btn--quiet', 'data-part': 'obs-line-cancel' }, 'Cancel');

    function paintLooks(): void {
      const dd = obs.descriptors.find((x) => x.code === desc.value);
      look.replaceChildren(h(doc, 'option', { value: '' }, dd ? 'No look-for' : '—'), ...(dd?.look_fors ?? []).map((l) => h(doc, 'option', { value: l.id }, l.label)));
      look.value = dd?.look_fors.some((l) => l.id === d.look_for) ? d.look_for! : '';
      const isT = kind.value === 'transition';
      desc.disabled = isT;
      look.disabled = isT || !dd;
    }
    desc.addEventListener('change', () => { d.look_for = null; paintLooks(); });
    kind.addEventListener('change', paintLooks);
    paintLooks();

    const submit = () => {
      const out: LineDraft = {
        clock: time.value, kind: kind.value as LogKind, text: text.value,
        descriptor: kind.value === 'transition' ? null : desc.value || null,
        look_for: kind.value === 'transition' ? null : look.value || null
      };
      if (!/^\d{1,3}(:[0-5]\d)?$/.test(out.clock.trim())) { msg.textContent = 'Time as mm:ss, e.g. 12:30.'; time.focus(); return; }
      if (onSave(out)) return;
      msg.textContent = 'Couldn’t save that line.';
    };
    save.addEventListener('click', submit);
    cancel.addEventListener('click', onCancel);
    const form = h(doc, 'div', { class: 'obs-lineform', 'data-part': 'obs-lineform', role: 'group', 'aria-label': saveLabel },
      h(doc, 'div', { class: 'obs-lineform__row' }, time, kind, desc, look),
      h(doc, 'div', { class: 'obs-lineform__row' }, text, save, cancel),
      msg);
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    });
    return form;
  }

  function afterLogChange(): void {
    renderLog();
    renderTally();
    syncWriteUp();
  }

  addMissed.addEventListener('click', () => {
    if (addHost.firstChild) { addHost.replaceChildren(); return; }
    const obs = ctx.obs();
    const form = lineForm({ clock: clockLabel(clockMs(obs, ctx.now())), descriptor: sel.code, look_for: null, kind: sel.kind, text: '' }, 'Add line', (dft) => {
      const before = new Set(ctx.obs().log.map((l) => l.id));
      const next = addLogLineAt(ctx.obs(), dft, ctx.now());
      if (next === ctx.obs()) return false;
      ctx.change(() => withGather(next), 'now');
      freshId = next.log.find((l) => !before.has(l.id))?.id ?? null;
      addHost.replaceChildren();
      const keep = freshId;
      renderTally(); syncWriteUp(); renderLog(); freshId = keep;
      return true;
    }, () => addHost.replaceChildren());
    addHost.replaceChildren(form);
    (form.querySelector('[data-field="text"]') as HTMLInputElement).focus();
  });

  function tags(obs: Observation, line: LogEntry): HTMLElement {
    const slot = slotOf(obs, line.descriptor);
    const d = obs.descriptors.find((x) => x.code === line.descriptor);
    const look = d?.look_fors.find((l) => l.id === line.look_for);
    const meta = kindMeta(line.kind);
    return h(doc, 'div', { class: 'obs-entry__tags' },
      line.descriptor ? h(doc, 'span', { class: `obs-lk ${slot}` }, line.descriptor) : null,
      look ? h(doc, 'span', { class: `obs-lk ${slot}` }, look.label) : null,
      h(doc, 'span', { class: `obs-kind ${meta.cls}` }, meta.label));
  }

  function entry(obs: Observation, line: LogEntry): HTMLElement {
    const text = h(doc, 'div', { class: 'obs-entry__text' }, line.text);
    const edit = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--xs obs-btn--quiet', 'aria-label': `Edit line at ${line.clock}`, 'data-part': 'obs-log-edit' }, 'Edit');
    const del = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--xs obs-btn--quiet', 'aria-label': `Delete line at ${line.clock}`, 'data-part': 'obs-log-delete' }, '×');
    const li = h(doc, 'li', { class: `obs-entry${line.id === freshId ? ' is-new' : ''}`, 'data-id': line.id },
      h(doc, 'span', { class: 'obs-entry__t' }, line.clock),
      h(doc, 'div', { class: 'obs-entry__body' }, tags(obs, line), text),
      h(doc, 'div', { class: 'obs-entry__tools' }, edit, del));
    edit.addEventListener('click', () => {
      const form = lineForm({ clock: line.clock, descriptor: line.descriptor, look_for: line.look_for, kind: line.kind, text: line.text }, 'Save', (dft) => {
        const next = editLogEntry(ctx.obs(), line.id, dft);
        if (next === ctx.obs()) return false;
        ctx.change(() => withGather(next), 'now');
        afterLogChange();
        return true;
      }, () => renderLog());
      li.replaceChildren(form);
      li.classList.add('is-editing');
      (form.querySelector('[data-field="text"]') as HTMLInputElement).focus();
    });
    del.addEventListener('click', () => {
      ctx.change((o) => withGather(deleteLogEntry(o, line.id)), 'now');
      afterLogChange();
    });
    return li;
  }

  function renderLog(): void {
    const obs = ctx.obs();
    logCount.textContent = ` · ${obs.log.length} ${obs.log.length === 1 ? 'line' : 'lines'}`;
    const lines = [...obs.log].reverse();
    logList.replaceChildren(...(lines.length ? lines.map((l) => entry(obs, l)) : [h(doc, 'li', { class: 'obs-muted obs-small obs-log__empty' }, 'Nothing logged yet.')]));
    freshId = null;
  }

  // ---------------------------------------------------------------- decisions (tally and write-up share them)
  const decideHosts: Array<{ code: string; host: HTMLElement }> = [];

  function setDecision(code: string, value: Decision): void {
    ctx.change((o) => {
      const row = o.write_up[code] ?? emptyRow();
      return { ...o, write_up: { ...o.write_up, [code]: { ...row, decision: row.decision === value ? null : value } } };
    }, 'now');
    paintDecisions();
  }

  function decide(code: string): HTMLElement {
    const host = h(doc, 'div', { class: 'obs-decide', role: 'group', 'aria-label': `Decision for ${code}`, 'data-code': code });
    decideHosts.push({ code, host });
    return host;
  }

  function paintDecisions(): void {
    const obs = ctx.obs();
    const t = tally(obs);
    for (const { code, host } of decideHosts) {
      const chosen = obs.write_up[code]?.decision ?? null;
      const suggested = chosen ? null : t[code]?.suggestion ?? null;
      host.replaceChildren(...DECISIONS.map((d) => {
        const b = h(doc, 'button', {
          type: 'button',
          class: `${d.cls}${chosen === d.value ? ' is-on' : ''}${suggested === d.value ? ' is-suggested' : ''}`,
          'aria-pressed': String(chosen === d.value),
          'data-decision': d.value,
          title: suggested === d.value ? `Suggested from the log: ${d.full}` : d.full
        }, d.label);
        b.addEventListener('click', () => setDecision(code, d.value));
        return b;
      }));
    }
  }

  // ---------------------------------------------------------------- tally
  const tallyHost = h(doc, 'div', { class: 'obs-tally', 'data-part': 'obs-tally' });

  function renderTally(): void {
    const obs = ctx.obs();
    const t = tally(obs);
    for (let i = decideHosts.length - 1; i >= 0; i--) if (tallyHost.contains(decideHosts[i]!.host)) decideHosts.splice(i, 1);
    tallyHost.replaceChildren(...obs.descriptors.map((d, i) => {
      const row = t[d.code]!;
      const bars = h(doc, 'div', { class: 'obs-bars', 'aria-hidden': 'true' },
        ...Array.from({ length: row.strengths }, () => h(doc, 'i', { class: 'is-s' })),
        ...Array.from({ length: row.next }, () => h(doc, 'i', { class: 'is-n' })),
        row.strengths + row.next === 0 ? h(doc, 'i', { class: 'is-empty' }) : null);
      const hits = h(doc, 'div', { class: 'obs-lookhits' }, ...d.look_fors.map((lf) => {
        const c = row.lookHits[lf.id] ?? 0;
        return h(doc, 'span', { class: c ? '' : 'is-zero' }, c ? `${lf.label} ×${c}` : lf.label);
      }));
      return h(doc, 'div', { class: `obs-trow ${slotClass(i)}`, 'data-code': d.code },
        h(doc, 'div', { class: 'obs-trow__top' },
          h(doc, 'span', { class: 'obs-code' }, d.code),
          h(doc, 'span', { class: 'obs-small obs-muted' },
            `${row.strengths} ${row.strengths === 1 ? 'strength' : 'strengths'} · ${row.next} ${row.next === 1 ? 'next step' : 'next steps'}`),
          h(doc, 'span', { class: 'obs-spacer' }),
          decide(d.code)),
        bars, hits);
    }));
    if (!obs.descriptors.length) tallyHost.append(h(doc, 'p', { class: 'obs-muted obs-small' }, 'No descriptors planned.'));
    paintDecisions();
  }

  // ---------------------------------------------------------------- planned impact + planning details
  function impactCard(): HTMLElement {
    const obs = ctx.obs();
    return h(doc, 'div', { class: 'obs-card' }, h(doc, 'h3', {}, 'Planned impact, from Planning'),
      ...obs.descriptors.map((d, i) => h(doc, 'p', { class: 'obs-small obs-impact' },
        h(doc, 'span', { class: `obs-code ${slotClass(i)}` }, d.code), ' ', d.planned_impact || h(doc, 'span', { class: 'obs-muted' }, 'Nothing written in Planning.'))));
  }

  function planningFold(): HTMLElement {
    const obs = ctx.obs();
    const p1 = NESA.p1;
    const line = (q: string, a: string) => (a.trim() ? h(doc, 'p', { class: 'obs-small' }, h(doc, 'b', {}, `${q} `), a) : null);
    return h(doc, 'details', { class: 'obs-card obs-fold', 'data-part': 'obs-planning-fold' },
      h(doc, 'summary', {}, 'Planning details'),
      ...obs.descriptors.map((d, i) => h(doc, 'div', { class: `obs-fold__d ${slotClass(i)}` },
        h(doc, 'div', { class: 'obs-row' }, h(doc, 'span', { class: 'obs-code' }, d.code), h(doc, 'b', { class: 'obs-small' }, focusOf(d.code))),
        line(p1.descriptors.why, d.why), line(p1.descriptors.practice, d.practice), line(p1.strategies.demonstrate, d.demonstrate),
        line(p1.impact.howKnow, d.how_know))),
      line(p1.strategies.lesson, obs.lesson.title),
      line(p1.strategies.allStudents, obs.plan_all_students),
      line(p1.impact.measure, obs.plan_measure));
  }

  // ---------------------------------------------------------------- write-up (Phase 2 table)
  const cells = new Map<string, { practice: HTMLTextAreaElement; strengths: HTMLTextAreaElement; comments: HTMLTextAreaElement }>();

  function cellInput(code: string, key: 'practice' | 'strengths' | 'comments', value: string): HTMLTextAreaElement {
    const label = key === 'practice' ? NESA.p2.practiceHead : key === 'strengths' ? NESA.p2.strengthsHead : NESA.p2.comments;
    const ta = h(doc, 'textarea', { class: 'obs-input obs-textarea', rows: key === 'comments' ? 2 : 5, 'aria-label': `${label} for ${code}`, 'data-cell': key, placeholder: key === 'comments' ? NESA.p2.comments : null });
    ta.value = value;
    ta.addEventListener('input', () => {
      ctx.change((o) => {
        const row = o.write_up[code] ?? emptyRow();
        const edited = key !== 'comments' && !row.edited.includes(key) ? [...row.edited, key] : row.edited;
        return { ...o, write_up: { ...o.write_up, [code]: { ...row, [key]: ta.value, edited } } };
      }, 'later');
    });
    return ta;
  }

  function writeUpTable(): HTMLElement {
    const obs = ctx.obs();
    const th = (title: string, small: string) => h(doc, 'th', { scope: 'col' }, title, small ? h(doc, 'small', {}, small) : null);
    const rows = obs.descriptors.map((d, i) => {
      const row = obs.write_up[d.code] ?? emptyRow();
      const c = { practice: cellInput(d.code, 'practice', row.practice), strengths: cellInput(d.code, 'strengths', row.strengths), comments: cellInput(d.code, 'comments', row.comments) };
      cells.set(d.code, c);
      const count = obs.log.filter((l) => l.descriptor === d.code).length;
      return h(doc, 'tr', { class: slotClass(i), 'data-code': d.code },
        h(doc, 'td', { 'data-label': NESA.p2.descriptor }, h(doc, 'span', { class: 'obs-code' }, d.code)),
        h(doc, 'td', { 'data-label': NESA.p2.practiceHead }, c.practice, h(doc, 'span', { class: 'obs-src' }, `↳ ${count} log ${count === 1 ? 'line' : 'lines'}`)),
        h(doc, 'td', { 'data-label': NESA.p2.strengthsHead }, c.strengths),
        h(doc, 'td', { 'data-label': NESA.p2.decisionHead }, decide(d.code), c.comments));
    });
    return h(doc, 'div', { class: 'obs-card obs-card--flush' },
      h(doc, 'table', { class: 'obs-nesa', 'data-part': 'obs-writeup' },
        h(doc, 'thead', {}, h(doc, 'tr', {},
          th(NESA.p2.descriptor, ''),
          th(NESA.p2.practiceHead, NESA.p2.practiceQs.join(' ')),
          th(NESA.p2.strengthsHead, NESA.p2.strengthsQ),
          th(NESA.p2.decisionHead, `${NESA.p2.decisionQ}. ${NESA.p2.comments}.`))),
        h(doc, 'tbody', {}, ...rows)));
  }

  function syncWriteUp(): void {
    const obs = ctx.obs();
    for (const [code, c] of cells) {
      const row = obs.write_up[code] ?? emptyRow();
      syncValue(c.practice, row.practice);
      syncValue(c.strengths, row.strengths);
      syncValue(c.comments, row.comments);
    }
  }

  const gather = h(doc, 'button', { type: 'button', class: 'obs-btn obs-btn--sm', 'data-part': 'obs-gather' }, '↻ Gather from Planning and log');
  const gatherMsg = h(doc, 'span', { class: 'obs-small obs-gather__msg', 'data-part': 'obs-gather-msg', role: 'status', 'aria-live': 'polite' });
  gather.addEventListener('click', () => {
    const before = ctx.obs();
    const after = withGather(before);
    let changed = 0;
    let kept = 0;
    for (const d of before.descriptors) {
      const a = before.write_up[d.code] ?? emptyRow();
      const b = after.write_up[d.code]!;
      if (a.practice !== b.practice) changed++;
      if (a.strengths !== b.strengths) changed++;
      kept += a.edited.filter((k) => a[k].trim()).length;
    }
    ctx.change(() => after, 'now');
    syncWriteUp();
    const hasSource = before.descriptors.some((d) => [d.demonstrate, d.practice, d.planned_impact, d.how_know].some((t) => t.trim()))
      || before.log.some((l) => l.descriptor);
    const keptNote = kept ? ` ${kept} edited ${kept === 1 ? 'cell' : 'cells'} left as you wrote ${kept === 1 ? 'it' : 'them'}.` : '';
    gatherMsg.textContent = changed
      ? `Filled ${changed} ${changed === 1 ? 'cell' : 'cells'}.${keptNote}`
      : hasSource
        ? `Already up to date.${keptNote}`
        : 'Nothing to gather yet. Cells fill from the Planning form (what you’ll demonstrate, planned impact) and from log lines tagged with a descriptor.';
    gatherMsg.classList.remove('is-flash');
    void gatherMsg.offsetWidth;
    gatherMsg.classList.add('is-flash');
  });

  // ---------------------------------------------------------------- mount
  // Rows Adam hasn't edited start from Planning and the log.
  const before = JSON.stringify(ctx.obs().write_up);
  const gathered = withGather(ctx.obs());
  if (JSON.stringify(gathered.write_up) !== before) ctx.change(() => gathered, 'later');

  renderClock();
  paintDock();
  renderLog();
  renderTally();
  const table = writeUpTable();
  paintDecisions();

  el.append(
    clockRow,
    h(doc, 'div', { class: 'obs-observe' },
      h(doc, 'div', { class: 'obs-stack obs-observe__main' }, dock, logCard),
      h(doc, 'div', { class: 'obs-stack' },
        h(doc, 'div', { class: 'obs-card' }, h(doc, 'h3', {}, 'Against each descriptor'), tallyHost,
          h(doc, 'p', { class: 'obs-muted obs-small' }, 'Green is strengths, amber next steps. Struck-through look-fors haven’t been seen yet. A dashed outline is the log’s suggestion; your pick replaces it.')),
        impactCard(),
        planningFold())),
    h(doc, 'div', { class: 'obs-divider' }, 'Write-up · Phase 2 of the report'),
    h(doc, 'div', { class: 'obs-row' },
      h(doc, 'span', { class: 'obs-muted obs-small' }, 'Each cell starts from what you planned for that descriptor, then the log lines tagged with it. Edit freely; gathering again leaves edited cells alone.'),
      h(doc, 'span', { class: 'obs-spacer' }), gatherMsg, gather),
    table);

  return {
    el,
    destroy() {
      doc.removeEventListener('keydown', onKey);
      if (tick) clearInterval(tick);
      tick = null;
    }
  };
}
