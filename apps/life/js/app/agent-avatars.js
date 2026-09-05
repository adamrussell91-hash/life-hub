/** Client-side agent roster for avatar picker (matches config/agents.yml). */
export const AGENT_AVATARS = [
  {
    slug: 'brisket',
    name: 'Brisket Lasso',
    shortName: 'Brisket',
    purpose: 'Meals, macros, and the day of eating.',
    src: 'assets/agents/brisket.jpg',
    colour: '#EEB046'
  },
  {
    slug: 'chadwick',
    name: 'Chadwick Flexington',
    shortName: 'Chadwick',
    purpose: 'Sessions, programs, and what to lift next.',
    src: 'assets/agents/chadwick.jpg',
    colour: '#D9683A'
  },
  {
    slug: 'hyaluronica',
    name: 'Hyaluronica St. Claire',
    shortName: 'Hyaluronica',
    purpose: 'Routines, products, and what’s on tonight.',
    src: 'assets/agents/hyaluronica.jpg',
    colour: '#C7AEEA'
  },
  {
    slug: 'hammond',
    name: 'General Hammond',
    shortName: 'Hammond',
    purpose: 'What’s running, decisions, and drift.',
    src: 'assets/agents/hammond.jpg',
    colour: '#2D2D2D'
  },
  {
    slug: 'penelope',
    name: 'Penelope Rose Quillian',
    shortName: 'Penelope',
    purpose: 'Diary interviews and on-this-day.',
    src: 'assets/agents/penelope.jpg',
    colour: '#8F373E'
  },
  {
    slug: 'vera',
    name: 'Dr Vera Lenz',
    shortName: 'Vera',
    purpose: 'A thinking partner for the hour.',
    src: 'assets/agents/vera.jpg',
    colour: '#37598A'
  },
  {
    slug: 'sara',
    name: 'Dr Sara Tonin',
    shortName: 'Sara',
    purpose: 'Labs, visits, and how you’re tracking.',
    src: 'assets/agents/sara.jpg',
    colour: '#BED3BC'
  },
  {
    slug: 'ann',
    name: "Ann O'Tation",
    shortName: 'Ann',
    purpose: 'Lesson diagnosis and one precise repair.',
    src: 'assets/agents/ann.png',
    colour: '#5B141A'
  },
  {
    slug: 'clementine',
    name: 'Professor Clementine Haig',
    shortName: 'Clementine',
    purpose: 'Claims, evidence, and cutting waffle.',
    src: 'assets/agents/clementine.png',
    colour: '#3B57A8'
  },
  {
    slug: 'clare',
    name: 'Clare DeMind',
    shortName: 'Clare',
    purpose: 'Dump the chaos. One thing, or twelve.',
    src: 'assets/agents/clare.png',
    colour: '#F7DD4C'
  }
];

export function avatarForSlug(slug) {
  return AGENT_AVATARS.find(agent => agent.slug === slug) ?? null;
}
