export const HUB_SECTIONS = [
  {
    id: 'teaching',
    title: 'Teaching',
    eyebrow: 'Classes and lessons',
    origin: 'https://teaching-hub.adam-russell.com',
    studentPublicPrefix: '/s/'
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    eyebrow: 'Archive and research',
    origin: null,
    studentPublicPrefix: null
  },
  {
    id: 'tasks',
    title: 'Tasks',
    eyebrow: 'Board',
    origin: null,
    studentPublicPrefix: null
  }
];

export function listHubSections() {
  return HUB_SECTIONS.map(section => ({ ...section }));
}
