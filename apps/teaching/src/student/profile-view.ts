/**
 * Student progress page `/s/classes/:id/profile`. noindex.
 *
 * The unit map starts grey and fills in as lessons are finished; four bars show mastery.
 * The server sends only the map and bar fractions, so there is nothing here to show a score,
 * a percentage or a count, and nothing is drawn that would imply one.
 */
import { apiPost } from '@/api/client';
import { button, deviceToken, el, errorText } from '@/quiz/dom';
import { ensureNoIndex } from '@/student/feedback-view';
import { createStudentShell, renderStudentChrome, renderStudentStatus, studentAnchor } from '@/student/shell';
import './profile.css';

type Role = 'core' | 'support' | 'extension' | 'optional';
type Fill = { mastered: number; building: number };
export type ProfileLesson = { id: string; title: string; role: Role; kind: 'lesson' | 'quiz'; done: boolean; assigned: boolean };
export type ProfilePayload = {
  need: 'initials' | null;
  initials?: string;
  map?: { lessons: ProfileLesson[]; next: string | null };
  fills?: Record<'understanding' | 'responding' | 'concepts' | 'skills', Fill>;
};

export type RenderProfileOptions = {
  classId: string;
  /** Called with the typed initials when the device holds no claim. */
  onClaim?: (initials: string) => void;
  /** A server message to show under the initials box. */
  message?: string;
};

const BARS = [
  { key: 'understanding', label: 'Understanding' },
  { key: 'responding', label: 'Responding' },
  { key: 'concepts', label: 'Concepts' },
  { key: 'skills', label: 'Skills' }
] as const;

const LANE: Record<Exclude<Role, 'core'>, string> = { support: 'Support', extension: 'Extension', optional: 'Option' };

/** Words for a bar, so the colour is never the only signal. */
function barWords(fill: Fill): string {
  if (fill.mastered > 0) return 'Mastered some';
  if (fill.building > 0) return 'Building';
  return 'Not started yet';
}

const pct = (n: number): string => `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;

function renderBars(fills: NonNullable<ProfilePayload['fills']>): HTMLElement {
  const section = el('section', 'pm-bars');
  section.setAttribute('aria-label', 'What you are building');
  for (const { key, label } of BARS) {
    const fill = fills[key] ?? { mastered: 0, building: 0 };
    const bar = el('div', 'pm-bar');
    const words = barWords(fill);
    bar.append(el('span', 'pm-bar__label', label), el('span', 'pm-bar__words', words));
    const track = el('div', 'pm-bar__track');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `${label}: ${words.toLowerCase()}`);
    const building = el('div', 'pm-bar__building');
    // Pale covers building and mastered together; strong sits on top, so a bar only ever fills.
    building.style.width = pct(fill.mastered + fill.building);
    const mastered = el('div', 'pm-bar__mastered');
    mastered.style.width = pct(fill.mastered);
    track.append(building, mastered);
    bar.append(track);
    section.append(bar);
  }
  section.append(el('p', 'pm-key', 'Pale shows what you are building. Strong shows what you have mastered.'));
  return section;
}

function renderRoute(map: NonNullable<ProfilePayload['map']>, classId: string): HTMLElement {
  const section = el('section', 'pm-map');
  section.append(el('h2', 'pm-map__title', 'Your unit'));
  if (!map.lessons.length) {
    section.append(el('p', 'pm-empty', 'Your teacher hasn’t set up a unit for this class yet.'));
    return section;
  }
  const list = el('ol', 'pm-route');
  for (const lesson of map.lessons) {
    const row = el('li', 'pm-row');
    row.dataset.lesson = lesson.id;
    row.classList.add(lesson.role === 'core' ? 'is-core' : `is-${lesson.role}`);
    if (lesson.done) row.classList.add('is-done');
    if (lesson.id === map.next) row.classList.add('is-next');
    if (!lesson.assigned) row.classList.add('is-faded');
    const node = el('span', `pm-node pm-node--${lesson.kind}`);
    node.setAttribute('aria-hidden', 'true');
    const text = el('div', 'pm-row__text');
    text.append(studentAnchor(`/s/classes/${classId}/lessons/${lesson.id}`, 'pm-row__link', lesson.title));
    const notes: string[] = [];
    if (lesson.role !== 'core') notes.push(LANE[lesson.role]);
    if (lesson.kind === 'quiz') notes.push('Quiz');
    if (lesson.done) notes.push('Done');
    if (lesson.id === map.next) notes.push('Next up');
    if (notes.length) text.append(el('span', 'pm-row__note', notes.join(' · ')));
    row.append(node, text);
    list.append(row);
  }
  section.append(list);
  return section;
}

function renderInitials(options: RenderProfileOptions): HTMLElement {
  const card = el('section', 'pm-claim');
  card.append(el('h2', 'pm-claim__title', 'Who are you?'));
  card.append(el('p', 'pm-claim__hint', 'Type your initials to see your progress. This browser will remember them.'));
  const input = el('input', 'pm-claim__input');
  input.type = 'text';
  input.maxLength = 6;
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';
  input.setAttribute('aria-label', 'Your initials');
  const go = button('Show my progress', 'primary', () => options.onClaim?.(input.value));
  const message = el('p', 'pm-claim__message', options.message ?? '');
  message.setAttribute('role', 'alert');
  message.hidden = !options.message;
  card.append(input, go, message);
  return card;
}

export function renderProfile(payload: ProfilePayload, options: RenderProfileOptions): HTMLElement {
  const root = el('article', 'pm-profile');
  if (payload.need === 'initials' || !payload.map || !payload.fills) {
    root.append(el('h1', 'pm-title', 'My progress'), renderInitials(options));
    return root;
  }
  root.append(el('h1', 'pm-title', 'My progress'));
  if (payload.initials) root.append(el('p', 'pm-who', `Signed in as ${payload.initials} on this device.`));
  root.append(renderBars(payload.fills), renderRoute(payload.map, options.classId));
  return root;
}

export type MountStudentProfileViewOptions = { root: HTMLElement; classId: string; isStale?: () => boolean };
export type StudentProfileViewHandle = { dispose(): void };

export function mountStudentProfileView(options: MountStudentProfileViewOptions): StudentProfileViewHandle {
  const { root, classId, isStale = () => false } = options;
  const clearNoIndex = ensureNoIndex();
  let disposed = false;

  root.replaceChildren();
  const { surface, header, content } = createStudentShell('student-surface__content--profile');
  root.append(surface);
  renderStudentChrome(header, { brand: 'Teaching Hub', links: [{ href: `/s/classes/${classId}`, label: 'Back to class' }] });
  renderStudentStatus(content, 'Loading your progress…');

  const call = (action: 'status' | 'claim', extra: Record<string, unknown> = {}): Promise<ProfilePayload> =>
    apiPost<ProfilePayload>(`/api/published/profile/${encodeURIComponent(classId)}`, { action, class_token: deviceToken(`class:${classId}`), ...extra });

  const show = (payload: ProfilePayload, message?: string): void => {
    if (disposed || isStale()) return;
    content.replaceChildren(
      renderProfile(payload, {
        classId,
        message,
        onClaim: (initials) => {
          void call('claim', { initials }).then(
            (next) => show(next),
            (error: unknown) => show({ need: 'initials' }, errorText(error))
          );
        }
      })
    );
  };

  void call('status').then(show, (error: unknown) => {
    if (disposed || isStale()) return;
    renderStudentStatus(content, errorText(error, 'Couldn’t load your progress. Try again.'));
  });

  return {
    dispose() {
      disposed = true;
      clearNoIndex();
    }
  };
}
