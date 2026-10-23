// apps/teaching/src/lecture/teacher-panel.ts
import { apiPost } from '@/api/client';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import { el, plural } from '@/quiz/dom';
import { lectureScenes } from './scenes';
import { previewBlocks } from './preview';
import { mountLecturePlayer } from './player';
import './lecture.css';

export type TeacherHandup = { id: string; scene_id: string; scene_label: string; text: string; status: 'open' | 'answered'; reply: string; at: string; clip_s: number; who: { initials: string; name: string | null } | null };
export type LectureSummary = { students: number; scenes: Record<string, { reached: number; replays: number }>; misses: Record<string, number>; handups: TeacherHandup[] };

export type LecturePanelOptions = {
  getLesson: () => Lesson;
  fetchSummary?: (lessonId: string) => Promise<LectureSummary>;
  answerHandup?: (lessonId: string, id: string, reply: string) => Promise<LectureSummary>;
  /** Drops a hand-up's answer into its scene as a callout. */
  onAddCallout: (sceneId: string, text: string) => void;
};

export type LecturePanelHandle = { root: HTMLElement; refresh(): Promise<void>; repaint(): void; dispose(): void };

const api = (lessonId: string, body: unknown) => apiPost<LectureSummary>(`/api/lessons/${encodeURIComponent(lessonId)}/lecture`, body);

/**
 * Shown above the canvas on a lesson whose type is Lecture: Play as student,
 * one strip of scenes shaded by how far the class got, and the hand-ups.
 * One call loads it all; it reloads when the teacher comes back to the tab.
 */
/** Gate ids inside a side path section, so their misses count with the scene. */
function sideGateIds(section: Block): string[] {
  const out: string[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      out.push(b.id);
      const c = b.content as { blocks?: Block[]; columns?: Array<{ blocks: Block[] }>; tabs?: Array<{ blocks: Block[] }> };
      if (c.blocks) walk(c.blocks);
      c.columns?.forEach((x) => walk(x.blocks));
      c.tabs?.forEach((x) => walk(x.blocks));
    }
  };
  walk(((section.content as { blocks?: Block[] }).blocks) ?? []);
  return out;
}

export function mountLecturePanel(options: LecturePanelOptions): LecturePanelHandle {
  const fetchSummary = options.fetchSummary ?? ((id) => api(id, { action: 'summary' }));
  const answerHandup = options.answerHandup ?? ((id, handup, reply) => api(id, { action: 'answer', id: handup, reply }));
  const root = el('section', 'lecture-panel');
  const head = el('div', 'lecture-panel__head');
  const title = el('h2', 'lecture-panel__title', 'Lecture');
  const play = el('button', 'btn btn--secondary', '▶ Play as student');
  play.type = 'button';
  head.append(title, play);
  const strip = el('div', 'lecture-replay');
  strip.setAttribute('role', 'list');
  strip.setAttribute('aria-label', 'Scenes by how many students reached them');
  const handups = el('div', 'lecture-handups');
  const status = el('p', 'lecture-panel__status');
  status.setAttribute('aria-live', 'polite');
  root.append(head, status, strip, handups);
  let data: LectureSummary | null = null;
  let failed = false;
  let ticket = 0;
  let disposed = false;

  play.addEventListener('click', () => openPreview());

  let closePreview: (() => void) | null = null;

  function openPreview(): void {
    if (closePreview) return;
    const lesson = options.getLesson();
    const overlay = el('div', 'lecture-preview');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Lecture preview');
    const close = el('button', 'btn btn--ghost lecture-preview__close', 'Close preview');
    close.type = 'button';
    const host = el('div', 'lecture-preview__host');
    const bar = el('div', 'lecture-preview__bar');
    bar.append(close);
    overlay.append(bar, host);
    document.body.append(overlay);
    const inerted: HTMLElement[] = [];
    for (const child of Array.from(document.body.children)) {
      if (child !== overlay && child instanceof HTMLElement && !child.hasAttribute('inert')) {
        child.setAttribute('inert', '');
        inerted.push(child);
      }
    }
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const player = mountLecturePlayer(host, {
      lessonId: lesson.id, title: lesson.title, blocks: previewBlocks(lesson.blocks), client: null, preview: true,
      renderHero: (h) => h.append(el('h1', 'lecture-title__heading', lesson.title))
    });
    // A dialog inside the preview (the hand-up sheet) takes its own Escape.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || overlay.querySelector('dialog[open]')) return;
      closeNow();
    };
    function closeNow(): void {
      if (!closePreview) return;
      closePreview = null;
      document.removeEventListener('keydown', onKey);
      player.dispose();
      overlay.remove();
      for (const node of inerted) node.removeAttribute('inert');
      document.body.style.overflow = priorOverflow;
      play.focus();
    }
    closePreview = closeNow;
    document.addEventListener('keydown', onKey);
    close.addEventListener('click', closeNow);
    close.focus();
  }

  function paint(): void {
    const lesson = options.getLesson();
    const scenes = lectureScenes(previewBlocks(lesson.blocks));
    status.replaceChildren();
    strip.replaceChildren();
    handups.replaceChildren();
    if (failed && !data) {
      status.append(document.createTextNode('Couldn’t load lecture activity. Try again. '));
      const retry = el('button', 'btn btn--secondary', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => void refresh());
      status.append(retry);
      return;
    }
    status.append(document.createTextNode(data ? (data.students ? `${plural(data.students, 'student')} started` : 'No students have started yet.') : 'Loading…'));
    const all = data?.handups ?? [];
    const openOf = (id: string) => all.filter((h) => h.scene_id === id && h.status === 'open');
    for (const scene of scenes) {
      const counts = data?.scenes[scene.id] ?? { reached: 0, replays: 0 };
      const misses = scene.beats.reduce((n, beat) => {
        const side = beat.sidePath ? sideGateIds(beat.sidePath) : [];
        return n + [beat.block.id, ...side].reduce((m, id) => m + (data?.misses[id] ?? 0), 0);
      }, 0);
      const hands = openOf(scene.id).length;
      const cell = el('div', 'lecture-replay__scene');
      cell.setAttribute('role', 'listitem');
      cell.style.setProperty('--reach', String(data?.students ? Math.round((counts.reached / data.students) * 100) / 100 : 0));
      const parts = [`${counts.reached} of ${data?.students ?? 0} reached`];
      if (counts.replays) parts.push(plural(counts.replays, 'replay'));
      if (hands) parts.push(plural(hands, 'hand-up'));
      if (misses) parts.push(`${misses} missed`);
      cell.setAttribute('aria-label', `${scene.label}: ${parts.join(', ')}`);
      cell.title = `${scene.label}: ${counts.reached} reached`;
      cell.append(el('span', 'lecture-replay__label', scene.label));
      const marks = el('span', 'lecture-replay__marks');
      if (counts.replays) marks.append(el('span', '', `↻ ${counts.replays}`));
      if (hands) marks.append(el('span', '', `✋ ${hands}`));
      if (misses) marks.append(el('span', '', `✗ ${misses}`));
      cell.append(marks);
      strip.append(cell);
    }
    if (!all.length) return;
    handups.append(el('h3', 'lecture-handups__title', 'Hand-ups'));
    const known = new Set(scenes.map((s) => s.id));
    const group = (title: string, list: TeacherHandup[], sceneId: string | null) => {
      if (!list.length) return;
      const box = el('div', 'lecture-handups__group');
      const open = list.filter((h) => h.status === 'open');
      box.append(el('p', 'lecture-handups__group-title', `${title} · ${open.length}`));
      for (const h of [...open, ...list.filter((h) => h.status !== 'open')]) box.append(handupRow(h, sceneId !== null));
      handups.append(box);
    };
    for (const scene of scenes) group(scene.label, all.filter((h) => h.scene_id === scene.id), scene.id);
    const orphans = all.filter((h) => !known.has(h.scene_id));
    if (orphans.length) group('Removed or moved parts', orphans, null);
  }

  function handupRow(h: TeacherHandup, canAdd = true): HTMLElement {
    const lesson = options.getLesson();
    const row = el('div', `lecture-handups__item${h.status === 'answered' ? ' lecture-handups__item--done' : ''}`);
    const whoText = h.who ? h.who.initials : 'A student';
    row.append(el('p', 'lecture-handups__who', `${whoText} · ${h.clip_s ? `${Math.floor(h.clip_s / 60)}:${String(h.clip_s % 60).padStart(2, '0')} in` : 'no clip'}`));
    row.append(el('p', 'lecture-handups__text', h.text || '(no question typed)'));
    if (h.status === 'answered') {
      row.append(el('p', 'lecture-handups__reply', `Answered${h.reply ? `: ${h.reply}` : ''}`));
      if (h.reply && canAdd) {
        const add = el('button', 'btn btn--ghost', 'Add as callout');
        add.type = 'button';
        add.addEventListener('click', () => options.onAddCallout(h.scene_id, h.reply));
        row.append(add);
      }
      return row;
    }
    const reply = el('input', 'lecture-handups__reply-input');
    reply.id = `lecture-reply-${h.id.replace(/[^\w-]/g, '_')}`;
    reply.placeholder = 'One-line reply (optional)';
    reply.maxLength = 500;
    const label = el('label', 'lecture-sr-only', `Reply to ${whoText}`);
    label.htmlFor = reply.id;
    const done = el('button', 'btn btn--secondary', 'Answered');
    done.type = 'button';
    const err = el('p', 'lecture-handups__error');
    err.setAttribute('aria-live', 'polite');
    done.addEventListener('click', async () => {
      done.disabled = true;
      err.textContent = '';
      try {
        const next = await answerHandup(lesson.id, h.id, reply.value.trim());
        if (disposed) return;
        data = next;
        paint();
      } catch {
        done.disabled = false;
        err.textContent = 'That didn’t save. Try again.';
      }
    });
    row.append(label, reply, done, err);
    return row;
  }

  async function refresh(): Promise<void> {
    const mine = ++ticket;
    try {
      const next = await fetchSummary(options.getLesson().id);
      if (disposed || mine !== ticket) return;
      data = next;
      failed = false;
    } catch {
      if (disposed || mine !== ticket) return;
      failed = true;
    }
    paint();
  }

  const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  paint();

  return { root, refresh, repaint: paint, dispose() { disposed = true; closePreview?.(); document.removeEventListener('visibilitychange', onVisible); root.remove(); } };
}
