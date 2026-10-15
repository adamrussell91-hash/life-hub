/** Hostname kids and other teachers see for a published lesson, unit, or class. */
export const CLASS_SITE_HOST = 'class.adam-russell.com';
export const CLASS_SITE_ORIGIN = `https://${CLASS_SITE_HOST}`;

/**
 * Origin for any page a student sees. The class site everywhere except local
 * dev, where the class host would point at production instead of this build.
 */
export function studentSiteOrigin(
  current: { hostname: string; origin: string } | undefined = typeof location !== 'undefined'
    ? location
    : undefined
): string {
  if (current && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(current.hostname)) return current.origin;
  return CLASS_SITE_ORIGIN;
}

const STUDENT_ROUTES = new Set([
  'student-lesson',
  'student-unit',
  'student-class',
  'student-class-lesson',
  'student-feedback'
]);

export function isClassSiteHost(
  hostname = typeof location !== 'undefined' ? location.hostname : ''
): boolean {
  return hostname === CLASS_SITE_HOST;
}

export function isClassSiteStudentRoute(name: string): boolean {
  return STUDENT_ROUTES.has(name);
}

/** No link, no sign-in, no way back to the umbrella. */
export function renderClassSiteDeadEnd(root: HTMLElement): void {
  root.replaceChildren();
  const message = document.createElement('p');
  message.textContent = "This page isn't available.";
  root.append(message);
  document.title = 'Page not available';
}
