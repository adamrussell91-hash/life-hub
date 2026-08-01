export const AGENTS = [
  { slug: 'brisket', name: 'Brisket Lasso', domain: 'nutrition', recordTypes: ['meal'], nameTriggers: ['brisket lasso', 'brisket'] },
  { slug: 'chadwick', name: 'Chadwick Flexington', domain: 'fitness', recordTypes: ['workout'], nameTriggers: ['chadwick flexington', 'chadwick', 'chad'] },
  { slug: 'hyaluronica', name: 'Hyaluronica St. Claire', domain: 'skincare', recordTypes: ['skincare'], nameTriggers: ['hyaluronica st. claire', 'hyaluronica'] },
  { slug: 'penelope', name: 'Penelope Rose Quillian', domain: 'mind', recordTypes: ['diary'], nameTriggers: ['penelope rose quillian', 'penelope'] },
  { slug: 'sara', name: 'Dr Sara Tonin', domain: 'body', recordTypes: ['weight', 'composition', 'measurements'], nameTriggers: ['dr sara tonin', 'sara tonin', 'sara'] },
  { slug: 'vera', name: 'Dr Vera Lenz', domain: null, recordTypes: [], nameTriggers: ['dr vera lenz', 'vera lenz', 'vera'] },
  { slug: 'hammond', name: 'General Hammond', domain: null, recordTypes: [], nameTriggers: ['general hammond', 'hammond'] }
];

export const ROUTER_SLUG = 'router';

export function routeAgent(message) {
  if (typeof message !== 'string') throw new TypeError('message must be a string');
  const normalized = message.toLowerCase();
  for (const agent of AGENTS) {
    if (agent.nameTriggers.some(trigger => normalized.includes(trigger))) return agent.slug;
  }
  return ROUTER_SLUG;
}

export function findAgent(slug) {
  return AGENTS.find(agent => agent.slug === slug) ?? null;
}
