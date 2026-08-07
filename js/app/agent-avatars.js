/** Client-side agent roster for avatar picker (matches config/agents.yml order for Mind/Chat). */
export const AGENT_AVATARS = [
  { slug: 'brisket', name: 'Brisket Lasso', src: 'assets/agents/brisket.jpg', fullSrc: 'assets/agents/full/brisket.png' },
  { slug: 'chadwick', name: 'Chadwick Flexington', src: 'assets/agents/chadwick.jpg', fullSrc: 'assets/agents/full/chadwick.png' },
  { slug: 'hyaluronica', name: 'Hyaluronica St. Claire', src: 'assets/agents/hyaluronica.jpg', fullSrc: 'assets/agents/full/hyaluronica.png' },
  { slug: 'hammond', name: 'General Hammond', src: 'assets/agents/hammond.jpg', fullSrc: 'assets/agents/full/hammond.png' },
  { slug: 'penelope', name: 'Penelope Rose Quillian', src: 'assets/agents/penelope.jpg', fullSrc: 'assets/agents/full/penelope.png' },
  { slug: 'vera', name: 'Dr Vera Lenz', src: 'assets/agents/vera.jpg', fullSrc: 'assets/agents/full/vera.png' },
  { slug: 'sara', name: 'Dr Sara Tonin', src: 'assets/agents/sara.jpg', fullSrc: 'assets/agents/full/sara.png' }
];

export function avatarForSlug(slug) {
  return AGENT_AVATARS.find(agent => agent.slug === slug) ?? null;
}
