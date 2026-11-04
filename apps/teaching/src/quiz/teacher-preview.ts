/**
 * Teacher preview of a student page. The teacher hub opens student links with
 * `#preview`; the page then shows quiz questions without asking for initials,
 * and nothing is claimed, started, saved or handed in. The flag lives in this
 * tab's session storage and the hash is stripped at once, so the address bar
 * never shows a link that could be copied to a class.
 *
 * Questions are already in the quiz status reply before a claim, so the flag
 * reveals nothing new; it only skips the sign-in and turns off every write.
 */

export const TEACHER_PREVIEW_HASH = 'preview';
const STORAGE_KEY = 'teacher-preview';

/** The student URL a teacher opens. Never the one copied for students. */
export function withTeacherPreview(url: string): string {
  return `${url.replace(/#.*$/, '')}#${TEACHER_PREVIEW_HASH}`;
}

/** True in a tab the teacher opened as a preview. First call takes the hash off the address bar. */
export function isTeacherPreview(): boolean {
  if (typeof window === 'undefined') return false;
  const fromHash = window.location.hash === `#${TEACHER_PREVIEW_HASH}`;
  try {
    if (fromHash) {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
      history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}`);
      return true;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return fromHash;
  }
}
