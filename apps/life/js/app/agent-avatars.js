/** Client-side agent roster for avatar picker (matches config/agents.yml). */
export const AGENT_AVATARS = [
  { slug: 'brisket', name: 'Brisket Lasso', src: 'assets/agents/brisket.jpg', colour: '#EEB046' },
  { slug: 'chadwick', name: 'Chadwick Flexington', src: 'assets/agents/chadwick.jpg', colour: '#D9683A' },
  { slug: 'hyaluronica', name: 'Hyaluronica St. Claire', src: 'assets/agents/hyaluronica.jpg', colour: '#C7AEEA' },
  { slug: 'hammond', name: 'General Hammond', src: 'assets/agents/hammond.jpg', colour: '#2D2D2D' },
  { slug: 'penelope', name: 'Penelope Rose Quillian', src: 'assets/agents/penelope.jpg', colour: '#8F373E' },
  { slug: 'vera', name: 'Dr Vera Lenz', src: 'assets/agents/vera.jpg', colour: '#37598A' },
  { slug: 'sara', name: 'Dr Sara Tonin', src: 'assets/agents/sara.jpg', colour: '#BED3BC' },
  { slug: 'ann', name: "Ann O'Tation", src: 'assets/agents/ann.png', colour: '#5B141A' },
  { slug: 'clementine', name: 'Professor Clementine Haig', src: 'assets/agents/clementine.png', colour: '#3B57A8' },
  { slug: 'clare', name: 'Clare DeMind', src: 'assets/agents/clare.png', colour: '#F7DD4C' }
];

export function avatarForSlug(slug) {
  return AGENT_AVATARS.find(agent => agent.slug === slug) ?? null;
}
