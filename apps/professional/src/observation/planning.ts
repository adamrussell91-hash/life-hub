/**
 * Phase 1 · Planning. Details, the descriptor picker, one card per picked descriptor under the template's
 * three column heads (with look-fors that become quick keys), and the whole-lesson answers.
 */
import { getObservation, listObservations } from './api';
import { PROFICIENT_DESCRIPTORS, STANDARD_NAMES } from './descriptors';
import { addDescriptor, addLookFor, MAX_DESCRIPTORS, MIN_DESCRIPTORS, removeDescriptor, removeLookFor, renameLookFor } from './model';
import type { Observation, PlannedDescriptor } from './types';
import { field, h, NESA, slotClass, type ObsCtx, type ObsView } from './ui';

type DescriptorText = 'why' | 'practice' | 'demonstrate' | 'planned_impact' | 'how_know';

export function mountPlanning(ctx: ObsCtx): ObsView {
  const { doc } = ctx;
  let destroyed = false;
  const el = h(doc, 'div', { class: 'obs-view obs-planning', 'data-part': 'obs-planning' });

  // ---------------------------------------------------------------- details
  const detailControls: Partial<Record<'nesa_number' | 'email' | 'school', HTMLInputElement>> = {};
  const prefillNote = h(doc, 'span', { class: 'obs-src', hidden: true }, '↳ from the last observation');

  function teacherField(key: 'name' | 'nesa_number' | 'email' | 'school', label: string): HTMLElement {
    const f = field(doc, {
      label, input: true, name: `teacher-${key}`, value: ctx.obs().teacher[key],
      onInput: (v) => {
        f.control.classList.remove('is-prefill');
        ctx.change((o) => ({ ...o, teacher: { ...o.teacher, [key]: v } }), 'later');
      }
    });
    if (key !== 'name') detailControls[key] = f.control as HTMLInputElement;
    return f.wrap;
  }
  function supervisorField(key: 'name' | 'nesa_number', label: string): HTMLElement {
    return field(doc, {
      label, input: true, name: `supervisor-${key}`, value: ctx.obs().supervisor[key],
      onInput: (v) => ctx.change((o) => ({ ...o, supervisor: { ...o.supervisor, [key]: v } }), 'later')
    }).wrap;
  }

  const details = h(doc, 'div', { class: 'obs-card' },
    h(doc, 'h3', {}, 'Details', h(doc, 'span', { class: 'obs-count' }, ' · change here if needed'), prefillNote),
    h(doc, 'div', { class: 'obs-grid2' },
      h(doc, 'div', { class: 'obs-stack obs-stack--tight' },
        h(doc, 'b', { class: 'obs-small' }, NESA.teacherDetails),
        teacherField('name', NESA.fullName), teacherField('nesa_number', NESA.nesaNumber),
        teacherField('email', NESA.email), teacherField('school', NESA.school)),
      h(doc, 'div', { class: 'obs-stack obs-stack--tight' },
        h(doc, 'b', { class: 'obs-small' }, NESA.supervisorDetails),
        supervisorField('name', NESA.fullName), supervisorField('nesa_number', NESA.nesaNumber))));

  /** Fill an empty NESA number, email or school from this teacher's newest earlier observation. */
  async function prefillFromEarlier(): Promise<void> {
    const obs = ctx.obs();
    const keys = (['nesa_number', 'email', 'school'] as const).filter((k) => !obs.teacher[k].trim());
    if (!keys.length || !obs.teacher.person_ref) return;
    try {
      const list = await listObservations({ person_ref: obs.teacher.person_ref });
      const other = list.find((s) => s.id !== obs.id);
      if (!other || destroyed) return;
      const earlier = await getObservation(other.id);
      if (destroyed) return;
      const fill: Partial<Observation['teacher']> = {};
      for (const k of keys) {
        const control = detailControls[k];
        const value = earlier.teacher[k]?.trim();
        if (!value || ctx.obs().teacher[k].trim() || (control && control.value.trim())) continue;
        fill[k] = value;
        if (control) { control.value = value; control.classList.add('is-prefill'); }
      }
      if (!Object.keys(fill).length) return;
      prefillNote.hidden = false;
      ctx.change((o) => ({ ...o, teacher: { ...o.teacher, ...fill } }), 'later');
    } catch {
      // Prefill is a convenience; typing works without it.
    }
  }

  // ---------------------------------------------------------------- picker
  const picker = h(doc, 'div', { class: 'obs-card', 'data-part': 'obs-picker' });
  const refusal = h(doc, 'p', { class: 'obs-refuse', role: 'status', 'data-part': 'obs-refuse' });

  function renderPicker(): void {
    const obs = ctx.obs();
    const picked = obs.descriptors.map((d) => d.code);
    const count = h(doc, 'span', { class: 'obs-count' }, ` · ${picked.length} picked`);
    const groups = [1, 2, 3, 4, 5, 6, 7].map((standard) => {
      const options = PROFICIENT_DESCRIPTORS.filter((d) => d.standard === standard).map((d) => {
        const slot = picked.indexOf(d.code);
        const btn = h(doc, 'button', {
          type: 'button',
          class: `obs-opt${slot >= 0 ? ` is-on ${slotClass(slot)}` : ''}${d.hardInOneLesson ? ' is-dim' : ''}`,
          'aria-pressed': String(slot >= 0),
          'data-code': d.code,
          title: d.hardInOneLesson ? 'Hard to see in one lesson' : d.text
        }, h(doc, 'code', {}, d.code), d.focus);
        btn.addEventListener('click', () => toggle(d.code));
        return btn;
      });
      const open = standard <= 5 || options.some((o) => o.classList.contains('is-on'));
      return h(doc, 'details', { class: 'obs-stdgroup', open },
        h(doc, 'summary', {}, `Standard ${standard} · ${STANDARD_NAMES[standard]}`),
        h(doc, 'div', { class: 'obs-desc-pick' }, ...options));
    });
    const need = picked.length < MIN_DESCRIPTORS
      ? h(doc, 'p', { class: 'obs-muted obs-small' }, `Pick ${MIN_DESCRIPTORS} to ${MAX_DESCRIPTORS}. Faded ones are hard to see in a single lesson; still pickable.`)
      : h(doc, 'p', { class: 'obs-muted obs-small' }, 'Faded ones are hard to see in a single lesson; still pickable.');
    picker.replaceChildren(h(doc, 'h3', {}, NESA.p1.descriptors.which, count), refusal, ...groups, need);
  }

  function hasContent(d: PlannedDescriptor): boolean {
    return d.look_fors.length > 0 || [d.why, d.practice, d.demonstrate, d.planned_impact, d.how_know].some((t) => t.trim());
  }

  function toggle(code: string): void {
    const obs = ctx.obs();
    const existing = obs.descriptors.find((d) => d.code === code);
    refusal.textContent = '';
    if (existing) {
      const confirm = doc.defaultView?.confirm;
      if (hasContent(existing) && confirm && !confirm.call(doc.defaultView, `Remove ${code}? Its planning answers and look-fors go with it.`)) return;
      ctx.change((o) => removeDescriptor(o, code), 'now');
    } else {
      const result = addDescriptor(obs, code);
      if (!result.ok) {
        refusal.textContent = result.reason;
        return;
      }
      ctx.change(() => result.observation, 'now');
    }
    renderPicker();
    renderCards();
  }

  // ---------------------------------------------------------------- descriptor cards
  const heads = h(doc, 'div', { class: 'obs-col3h' },
    colHead(NESA.p1.descriptors.head, [NESA.p1.descriptors.why, NESA.p1.descriptors.practice]),
    colHead(NESA.p1.strategies.head, [NESA.p1.strategies.demonstrate]),
    colHead(NESA.p1.impact.head, [NESA.p1.impact.planned, NESA.p1.impact.howKnow]));
  const cards = h(doc, 'div', { class: 'obs-stack', 'data-part': 'obs-dcards' });

  // The template's questions already label each field, so the column head is the title alone.
  function colHead(title: string, _questions: string[]): HTMLElement {
    return h(doc, 'div', { class: 'obs-colh' }, title);
  }

  function textFor(code: string, key: DescriptorText, label: string): HTMLElement {
    const d = ctx.obs().descriptors.find((x) => x.code === code);
    return field(doc, {
      label, name: `${code}-${key}`, value: d?.[key] ?? '',
      onInput: (v) => ctx.change((o) => ({ ...o, descriptors: o.descriptors.map((x) => (x.code === code ? { ...x, [key]: v } : x)) }), 'later')
    }).wrap;
  }

  function renderLooks(code: string, host: HTMLElement, focusAdd = false): void {
    const d = ctx.obs().descriptors.find((x) => x.code === code);
    if (!d) return;
    const chips = d.look_fors.map((lf) => {
      const name = h(doc, 'button', { type: 'button', class: 'obs-look__name', title: 'Rename' }, lf.label);
      name.addEventListener('click', () => {
        const input = h(doc, 'input', { type: 'text', class: 'obs-input obs-look__edit', 'aria-label': `Rename look-for ${lf.label}` });
        input.value = lf.label;
        let done = false;
        const finish = (save: boolean) => {
          if (done) return;
          done = true;
          const label = input.value.trim();
          if (save && label && label !== lf.label) ctx.change((o) => renameLookFor(o, code, lf.id, label), 'now');
          renderLooks(code, host);
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        input.addEventListener('blur', () => finish(true));
        name.replaceWith(input);
        input.focus();
        input.select();
      });
      const remove = h(doc, 'button', { type: 'button', class: 'obs-look__x', 'aria-label': `Remove look-for ${lf.label}` }, '×');
      remove.addEventListener('click', () => {
        ctx.change((o) => removeLookFor(o, code, lf.id), 'now');
        renderLooks(code, host);
      });
      return h(doc, 'span', { class: 'obs-look', 'data-look': lf.id }, lf.key ? h(doc, 'kbd', {}, lf.key) : null, name, remove);
    });
    const add = h(doc, 'input', { type: 'text', class: 'obs-input obs-look__add', placeholder: '+ Add look-for · Enter', 'aria-label': `Add look-for to ${code}`, 'data-part': 'obs-look-add', maxlength: 200 });
    add.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!add.value.trim()) return;
      ctx.change((o) => addLookFor(o, code, add.value), 'now');
      renderLooks(code, host, true);
    });
    host.replaceChildren(...chips, add);
    if (focusAdd) add.focus();
  }

  function card(d: PlannedDescriptor, index: number): HTMLElement {
    const { code } = d;
    const desc = PROFICIENT_DESCRIPTORS.find((x) => x.code === code);
    const looks = h(doc, 'div', { class: 'obs-looks' });
    renderLooks(code, looks);
    const inlineHead = (t: string) => h(doc, 'div', { class: 'obs-colh obs-colh--inline' }, t);
    return h(doc, 'article', { class: `obs-dcard ${slotClass(index)}`, 'data-code': code },
      h(doc, 'div', { class: 'obs-dcard__head' }, h(doc, 'span', { class: 'obs-code' }, code), h(doc, 'b', {}, desc?.focus ?? code)),
      h(doc, 'p', { class: 'obs-dcard__text' }, desc?.text ?? ''),
      h(doc, 'div', { class: 'obs-grid3' },
        h(doc, 'div', { class: 'obs-stack obs-stack--tight' }, inlineHead(NESA.p1.descriptors.head),
          textFor(code, 'why', NESA.p1.descriptors.why), textFor(code, 'practice', NESA.p1.descriptors.practice)),
        h(doc, 'div', { class: 'obs-stack obs-stack--tight' }, inlineHead(NESA.p1.strategies.head),
          textFor(code, 'demonstrate', NESA.p1.strategies.demonstrate)),
        h(doc, 'div', { class: 'obs-stack obs-stack--tight' }, inlineHead(NESA.p1.impact.head),
          textFor(code, 'planned_impact', NESA.p1.impact.planned), textFor(code, 'how_know', NESA.p1.impact.howKnow))),
      h(doc, 'p', { class: 'obs-ask obs-looks__lbl' }, 'Look-fors', h(doc, 'i', {}, ' · what you’ll actually see; each becomes a quick key')),
      looks);
  }

  function renderCards(): void {
    const obs = ctx.obs();
    heads.hidden = obs.descriptors.length === 0;
    cards.replaceChildren(...obs.descriptors.map(card));
  }

  // ---------------------------------------------------------------- whole lesson
  const s = NESA.p1.strategies;
  const lessonTitle = field(doc, {
    label: s.lesson, input: true, name: 'lesson-title', value: ctx.obs().lesson.title,
    onInput: (v) => ctx.change((o) => ({ ...o, lesson: { ...o.lesson, title: v } }), 'later')
  });
  const lessonLink = field(doc, {
    label: 'Link to the lesson', hint: 'optional', input: true, name: 'lesson-link', value: ctx.obs().lesson.link,
    onInput: (v) => ctx.change((o) => ({ ...o, lesson: { ...o.lesson, link: v } }), 'later')
  });
  const syllabus = field(doc, {
    label: s.syllabus, name: 'lesson-syllabus', value: ctx.obs().lesson.syllabus_link,
    onInput: (v) => ctx.change((o) => ({ ...o, lesson: { ...o.lesson, syllabus_link: v } }), 'later')
  });
  const allStudents = field(doc, {
    label: s.allStudents, name: 'plan-all-students', value: ctx.obs().plan_all_students,
    onInput: (v) => ctx.change((o) => ({ ...o, plan_all_students: v }), 'later')
  });
  const measure = field(doc, {
    label: NESA.p1.impact.measure, name: 'plan-measure', value: ctx.obs().plan_measure,
    onInput: (v) => ctx.change((o) => ({ ...o, plan_measure: v }), 'later')
  });
  const whole = h(doc, 'div', { class: 'obs-card', 'data-part': 'obs-whole-lesson' },
    h(doc, 'h3', {}, 'For the whole lesson'),
    h(doc, 'div', { class: 'obs-grid2' },
      h(doc, 'div', { class: 'obs-stack obs-stack--tight' }, lessonTitle.wrap, lessonLink.wrap, syllabus.wrap),
      h(doc, 'div', { class: 'obs-stack obs-stack--tight' }, allStudents.wrap, measure.wrap)));

  renderPicker();
  renderCards();
  el.append(details, picker, heads, cards, whole,
    h(doc, 'p', { class: 'obs-muted obs-small' }, 'Where the template asks a question once for the whole lesson, it sits here once. Where the answer differs per descriptor, it sits on the descriptor. Export puts it all back in NESA’s three columns.'));
  void prefillFromEarlier();

  return { el, destroy() { destroyed = true; } };
}
