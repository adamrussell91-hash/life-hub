/** Client-side agent roster for avatar picker (matches config/agents.yml order for Mind/Chat). */
export const AGENT_AVATARS = [
  { slug: 'brisket', name: 'Brisket Lasso', src: 'assets/agents/brisket.jpg' },
  { slug: 'chadwick', name: 'Chadwick Flexington', src: 'assets/agents/chadwick.jpg' },
  { slug: 'hyaluronica', name: 'Hyaluronica St. Claire', src: 'assets/agents/hyaluronica.jpg' },
  { slug: 'hammond', name: 'General Hammond', src: 'assets/agents/hammond.jpg' },
  { slug: 'penelope', name: 'Penelope Rose Quillian', src: 'assets/agents/penelope.jpg' },
  { slug: 'vera', name: 'Dr Vera Lenz', src: 'assets/agents/vera.jpg' },
  { slug: 'sara', name: 'Dr Sara Tonin', src: 'assets/agents/sara.jpg' }
];

export function avatarForSlug(slug) {
  return AGENT_AVATARS.find(agent => agent.slug === slug) ?? null;
}
