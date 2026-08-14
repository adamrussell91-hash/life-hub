/** Client-side agent roster for avatar picker (matches config/agents.yml). */
export const AGENT_AVATARS = [
  { slug: 'brisket', name: 'Brisket Lasso', src: 'assets/agents/brisket.jpg', colour: '#EEB046' },
  { slug: 'chadwick', name: 'Chadwick Flexington', src: 'assets/agents/chadwick.jpg', colour: '#D9683A' },
  { slug: 'hyaluronica', name: 'Hyaluronica St. Claire', src: 'assets/agents/hyaluronica.jpg', colour: '#C7AEEA' },
  { slug: 'hammond', name: 'General Hammond', src: 'assets/agents/hammond.jpg', colour: '#2D2D2D' },
  { slug: 'penelope', name: 'Penelope Rose Quillian', src: 'assets/agents/penelope.jpg', colour: '#8F373E' },
  { slug: 'vera', name: 'Dr Vera Lenz', src: 'assets/agents/vera.jpg', colour: '#37598A' },
  { slug: 'sara', name: 'Dr Sara Tonin', src: 'assets/agents/sara.jpg', colour: '#BED3BC' }
];

export function avatarForSlug(slug) {
  return AGENT_AVATARS.find(agent => agent.slug === slug) ?? null;
}
