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
