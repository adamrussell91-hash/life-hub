import { catalog } from '../../../config/knowledge/cognitive/definitions.mjs';

const HAMMOND_COACHING = [
  'Direction Session',
  'Session Triage',
  'Cross-Domain Tension',
  'Major Decision',
  'Drift Detection',
  'Escalation',
  'Closed Loop Review',
  'Weekly Review'
];

const SUGGEST_WHEN = [
  { moment: 'Direction, stay-vs-leave, career, or a fuzzy end state', id: 'horizon', mode: 'brief' },
  { moment: 'Conflict between behaviour, aspiration and present capacity (including recomposition frustration)', id: 'mirror', mode: 'quick' },
  { moment: '"I always fall off after day 3" / an entrenched pattern', id: 'tribunal', mode: 'quick' },
  { moment: 'Final review: "what actually worked?"', id: 'witness', mode: 'standard' },
  { moment: 'What next after a sprint, or a live dialectic', id: 'fates', mode: 'sprint' },
  { moment: 'Writing / argument / doctoral application', id: 'refinery', mode: 'build-break' },
  { moment: 'Turn literature into a purpose-fit map', id: 'cartographers', mode: 'focused' },
  { moment: 'An ethical dimension only', id: 'consilium', mode: 'standard' }
];

const RULES = [
  { id: 'horizon', mode: 'brief', score: 5, why: 'This is a direction question: map present trajectories against a desired future.', patterns: [/stay[- ]?vs[- ]?leave/i, /\bhpge\b/i, /department of ed/i, /desired future/i, /trajectory/i, /fuzzy/i, /direction thread/i, /leadership role/i, /staying put/i] },
  { id: 'mirror', mode: 'quick', score: 5, why: 'Conflict between behaviour, aspiration and present capacity.', patterns: [/recomp/i, /body fat/i, /18\.9/, /8[-–]?10\s*%/i, /frustrat/i, /aspiration/i, /present capacity/i, /\bbehaviou?r\b/i, /82kg/i] },
  { id: 'tribunal', mode: 'quick', score: 4, why: 'An entrenched pattern needs three independent reframes, not another pep talk.', patterns: [/always fall off/i, /entrenched/i, /stuck (?:in|with)/i] },
  { id: 'consilium', mode: 'standard', score: 4, why: 'Incompatible ethical standpoints — deliberate without a verdict.', patterns: [/ethic/i, /dilemma/i, /\bmoral\b/i] },
  { id: 'witness', mode: 'standard', score: 3, why: 'Audit a specific thinking process and calibrate trust in the result.', patterns: [/what actually worked/i, /\baudit\b/i] },
  { id: 'refinery', mode: 'build-break', score: 3, why: 'Build, break and reforge a defensible argument.', patterns: [/argument/i, /\bthesis\b/i, /doctoral/i] },
  { id: 'cartographers', mode: 'focused', score: 3, why: 'Turn literature into a purpose-fit knowledge representation.', patterns: [/literature/i, /\bpapers\b/i, /synthesis/i] },
  { id: 'fates', mode: 'sprint', score: 2, why: 'Live dialectic across generative, critical and strategic voices.', patterns: [/what next/i, /dialectic/i] }
];

function byId(id) {
  return catalog.find(item => item.id === id) || null;
}

export function thinkingProtocolDeepLink({ id, mode, fields } = {}) {
  const params = new URLSearchParams();
  const protocolId = String(id || '').trim();
  if (protocolId) params.set('id', protocolId);
  const protocolMode = String(mode || '').trim();
  if (protocolMode) params.set('mode', protocolMode);
  for (const [key, value] of Object.entries(fields || {})) {
    const text = String(value || '').trim();
    if (key && text) params.set(key, text);
  }
  const query = params.toString();
  return query ? `#protocols?${query}` : '#protocols';
}

export function recommendThinkingProtocol({ message = '', context = '' } = {}) {
  const haystack = `${message}\n${context}`;
  let best = null;
  for (const rule of RULES) {
    if (!rule.patterns.some(re => re.test(haystack))) continue;
    if (!best || rule.score > best.score) best = rule;
  }
  const picked = best || {
    id: 'horizon',
    mode: 'brief',
    why: 'No live thread matched a tighter protocol — Horizon Council maps direction when the topic is still unpicked.'
  };
  const def = byId(picked.id);
  return {
    id: picked.id,
    name: def?.name || picked.id,
    mode: picked.mode,
    why: picked.why,
    link: thinkingProtocolDeepLink({ id: picked.id, mode: picked.mode })
  };
}

export function formatThinkingProtocolCatalogForPrompt() {
  const rows = catalog.map(item => {
    const modes = item.modes.map(mode => mode.id).join('/');
    return `- ${item.id} — ${item.name} — ${item.description} Default mode: ${item.defaultMode} (${modes}).`;
  }).join('\n');
  const moments = SUGGEST_WHEN.map(row => {
    const def = byId(row.id);
    return `- ${row.moment} → ${def?.name || row.id} (${row.id}, mode ${row.mode})`;
  }).join('\n');
  return [
    'Knowledge Hub Thinking protocols (suggest; do not run them for Adam).',
    `These eight are the only Thinking protocols. ${HAMMOND_COACHING.join(', ')} are Hammond coaching moves — not a Thinking protocol. Never answer a thinking-protocol ask with Direction Session or a "decision-architecture pass".`,
    'When Adam asks which thinking protocol, what to run it on, or says he wants to do one: name exactly one catalog protocol (id + name + mode + one-line why) and give the Knowledge deep link `#protocols?id=<id>&mode=<mode>`. Do not refuse. Unsolicited: at most one suggestion per turn, only when clearly relevant to this lane.',
    'Catalog:',
    rows,
    'When to suggest:',
    moments
  ].join('\n');
}

export function hammondThinkingProtocolLastReadRule() {
  return [
    'Before sending this reply: if Adam asked for a thinking protocol, did you name exactly one Knowledge Hub catalog protocol (The Three Fates, Horizon Council, Refinery, Cartographers, Mirror Council, Consilium, Witness, Tribunal of Frames) with mode, why, and a #protocols deep link?',
    'If you wrote Direction Session, Session Triage, or a decision-architecture pass instead, rewrite — those are not Thinking protocols.'
  ].join(' ');
}
