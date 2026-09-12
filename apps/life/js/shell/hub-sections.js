// Professional Hub is intentionally absent from this registry — it drives
// the Life dashboard's live pulse cards, and Slice 4 explicitly does not add
// a Professional pulse card (hub navigation inclusion — the rail switcher
// and mobile More sheet — is sufficient). See
// `docs/universal-links/milestone-4-build-programme.md`, Job B.
export const HUB_SECTIONS = [
  {
    id: 'teaching',
    title: 'Teaching',
    eyebrow: 'Classes and lessons',
    origin: '/teaching/',
    studentPublicPrefix: '/teaching/s/',
    pulse: 'classes'
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    eyebrow: 'Archive and research',
    origin: '/knowledge/',
    studentPublicPrefix: null,
    pulse: 'notes'
  },
  {
    id: 'tasks',
    title: 'Tasks',
    eyebrow: 'Board',
    origin: '/tasks/',
    studentPublicPrefix: null,
    pulse: 'tasks'
  }
];

export function listHubSections() {
  return HUB_SECTIONS.map(section => ({ ...section }));
}
