/**
 * Teaching student API that must stay unauthenticated when those handlers
 * land on this site. Paths are namespaced under /api/published and /api/media
 * so they never share Adam's operator session gate.
 */
export const PUBLIC_STUDENT_API_ROUTES = [
  { method: 'GET', pattern: /^\/\.netlify\/functions\/published-lesson(?:\/|$)/ },
  { method: 'GET', pattern: /^\/api\/published\/lessons\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/published\/units\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/published\/classes\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/media\/[^/]+\/file$/ },
  { method: 'POST', pattern: /^\/api\/html-app-ai$/ }
];

export function isPublicStudentApi(method, pathname) {
  const verb = String(method || '').toUpperCase();
  const path = String(pathname || '');
  return PUBLIC_STUDENT_API_ROUTES.some(route => route.method === verb && route.pattern.test(path));
}
