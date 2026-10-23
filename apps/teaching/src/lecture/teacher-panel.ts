// apps/teaching/src/lecture/teacher-panel.ts
import { apiPost } from '@/api/client';
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
  const handups = el('div', 'lecture-handups');
  const status = el('p', 'lecture-panel__status');
  root.append(head, status, strip, handups);
  let data: LectureSummary | null = null;

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
    overlay.append(close, host);
    document.body.append(overlay);
    const player = mountLecturePlayer(host, {
      lessonId: lesson.id, title: lesson.title, blocks: previewBlocks(lesson.blocks), client: null, preview: true,
      renderHero: (h) => h.append(el('h1', 'lecture-title__heading', lesson.title))
    });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeNow(); };
    function closeNow(): void {
      if (!closePreview) return;
      closePreview = null;
      document.removeEventListener('keydown', onKey);
      player.dispose();
      overlay.remove();
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
    status.textContent = data ? (data.students ? `${plural(data.students, 'student')} started` : 'No students have started yet.') : 'Loading…';
    strip.replaceChildren();
    for (const scene of scenes) {
      const counts = data?.scenes[scene.id] ?? { reached: 0, replays: 0 };
      const misses = scene.beats.reduce((n, beat) => n + (data?.misses[beat.block.id] ?? 0), 0);
      const hands = data?.handups.filter((h) => h.scene_id === scene.id).length ?? 0;
      const cell = el('div', 'lecture-replay__scene');
      cell.style.setProperty('--reach', String(data?.students ? Math.round((counts.reached / data.students) * 100) / 100 : 0));
      cell.title = `${scene.label}: ${counts.reached} reached`;
      cell.append(el('span', 'lecture-replay__label', scene.label));
      const marks = el('span', 'lecture-replay__marks');
      if (counts.replays) marks.append(el('span', '', `↻ ${counts.replays}`));
      if (hands) marks.append(el('span', '', `✋ ${hands}`));
      if (misses) marks.append(el('span', '', `✗ ${misses}`));
      cell.append(marks);
      strip.append(cell);
    }
    handups.replaceChildren();
    const open = data?.handups ?? [];
    if (!open.length) return;
    handups.append(el('h3', 'lecture-handups__title', 'Hand-ups'));
    for (const scene of scenes) {
      const group = open.filter((h) => h.scene_id === scene.id);
      if (!group.length) continue;
      const box = el('div', 'lecture-handups__group');
      box.append(el('p', 'lecture-handups__group-title', `${scene.label} · ${group.length}`));
      for (const h of group) box.append(handupRow(h));
      handups.append(box);
    }
  }

  function handupRow(h: TeacherHandup): HTMLElement {
    const lesson = options.getLesson();
    const row = el('div', `lecture-handups__item${h.status === 'answered' ? ' lecture-handups__item--done' : ''}`);
    const whoText = h.who ? h.who.initials : 'A student';
    row.append(el('p', 'lecture-handups__who', `${whoText} · ${h.clip_s ? `${Math.floor(h.clip_s / 60)}:${String(h.clip_s % 60).padStart(2, '0')} in` : 'no clip'}`));
    row.append(el('p', 'lecture-handups__text', h.text || '(no question typed)'));
    if (h.status === 'answered') {
      row.append(el('p', 'lecture-handups__reply', `Answered${h.reply ? `: ${h.reply}` : ''}`));
      if (h.reply) {
        const add = el('button', 'btn btn--ghost', 'Add as callout');
        add.type = 'button';
        add.addEventListener('click', () => options.onAddCallout(h.scene_id, h.reply));
        row.append(add);
      }
      return row;
    }
    const reply = el('input', 'lecture-handups__reply-input');
    reply.placeholder = 'One-line reply (optional)';
    reply.maxLength = 500;
    const done = el('button', 'btn btn--secondary', 'Answered');
    done.type = 'button';
    done.addEventListener('click', async () => {
      done.disabled = true;
      try {
        data = await answerHandup(lesson.id, h.id, reply.value.trim());
        paint();
      } catch {
        done.disabled = false;
      }
    });
    row.append(reply, done);
    return row;
  }

  async function refresh(): Promise<void> {
    try {
      data = await fetchSummary(options.getLesson().id);
    } catch {
      data = data ?? { students: 0, scenes: {}, misses: {}, handups: [] };
    }
    paint();
  }

  const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  paint();

  return { root, refresh, repaint: paint, dispose() { closePreview?.(); document.removeEventListener('visibilitychange', onVisible); root.remove(); } };
}
