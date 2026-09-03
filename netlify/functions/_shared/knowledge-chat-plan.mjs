export const CHAT_HATS = [
  {
    id: 'fromBook',
    label: 'From a book',
    defaultScope: 'standard',
    defaultDepth: 'single',
    plan: 'Pick the book. Capture the idea, term, or question from the page. Search the open web — not the archive — and write a referenced information page that says how this bears on the book.'
  },
  {
    id: 'scoping',
    label: 'Scoping',
    defaultScope: 'wide',
    defaultDepth: 'single',
    plan: 'Wide sweep, few bodies. Clusters + counts + one exemplar each + gaps. Cheap map, not an essay.'
  },
  {
    id: 'synthesis',
    label: 'Thematic synthesis',
    defaultScope: 'standard',
    defaultDepth: 'iterative',
    plan: 'Retrieve, read note bodies, write an evidence-mapped thematic synthesis. Always produce a central claim (relationship + mechanism + implication, at most two sentences, confidence-rated). Cluster into 3 to 7 themes with source counts and confidence. Map major claims to sources. Label direct findings versus inferences. Separate explanatory levels. End with a ranked limitations table and an explicit answer to the question. Every claim carries a markdown note link [Title](pageId). Never invent a page. Never write a raw page id.'
  },
  {
    id: 'evidence',
    label: 'Evidence check',
    defaultScope: 'narrow',
    defaultDepth: 'verified',
    plan: 'Take the claim. Search paraphrase, key entity, and negation. Classify supports / contradicts / silent. Verdict with contradictions first.'
  },
  {
    id: 'contested',
    label: 'Contested ground',
    defaultScope: 'narrow',
    defaultDepth: 'verified',
    plan: 'Negation is first-class. Return disagreement pairs, sorted by how hard they clash, not by relevance.'
  },
  {
    id: 'internalExternal',
    label: 'Internal-then-external',
    defaultScope: 'standard',
    defaultDepth: 'single',
    plan: 'Internal archive first plus an honest coverage read. If thin, say so. Do not search the web unless the user clicked Search outside. External hits never look like archive citations.'
  },
  {
    id: 'methods',
    label: 'Methods',
    defaultScope: 'narrow',
    defaultDepth: 'single',
    plan: 'Filter to methods-tagged notes first, then search only inside that set. A methods question cannot be answered from a content note.'
  },
  {
    id: 'writing',
    label: 'Writing',
    defaultScope: 'standard',
    defaultDepth: 'single',
    plan: 'Writing help when a thesis or draft is in play. Protocols in prose (reverse outline, stress test, editors) only then. If he asks a knowledge or practice question, answer it from the archive. Do not become a gatekeeper. Do not silently become Synthesis.'
  }
];

export const CHAT_PERSONALITIES = [
  { id: 'clementine', voiceFile: 'clementine-voice.md' },
  { id: 'ann', voiceFile: 'annotation-voice.md' }
];

const K_FOR_SCOPE = { narrow: 8, standard: 16, wide: 32 };
const ROUNDS_FOR_DEPTH = { single: 1, verified: 2, iterative: 5, exhaustive: 5 };
export const METHODS_TAG = 'Research Methods and Evidence Literacy';

export function isChatHatId(value) {
  return CHAT_HATS.some(hat => hat.id === value);
}

export function personalityById(id) {
  return CHAT_PERSONALITIES.find(item => item.id === id);
}

export function normalizeProtocolId(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64 || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(trimmed)) return undefined;
  return trimmed;
}

export function resolveChatPlan(hatId, overrides = {}) {
  const hat = CHAT_HATS.find(item => item.id === hatId);
  if (!hat) throw new Error(`Unknown chat hat: ${hatId}`);
  const scope = overrides.scope ?? hat.defaultScope;
  const depth = overrides.depth ?? hat.defaultDepth;
  return {
    hat,
    scope,
    depth,
    k: depth === 'exhaustive' ? 48 : K_FOR_SCOPE[scope],
    maxRounds: ROUNDS_FOR_DEPTH[depth],
    kernel: depth === 'single' ? 'quick' : 'deep',
    tags: hat.id === 'methods' ? [METHODS_TAG] : undefined,
    negation: hat.id === 'evidence' || hat.id === 'contested'
  };
}

export function writeMaxTokens(input) {
  if (input.hat === 'synthesis') return 4000;
  if (input.hat === 'fromBook') return 3500;
  return resolveChatPlan(input.hat, input).kernel === 'deep' ? 2000 : 1200;
}

export function normalizeBookContext(value) {
  if (!value || typeof value !== 'object') return undefined;
  const label = typeof value.label === 'string' ? value.label.replace(/\s+/g, ' ').trim() : '';
  if (!label) return undefined;
  const locus = typeof value.locus === 'string' ? value.locus.replace(/\s+/g, ' ').trim() : '';
  return locus ? { label, locus } : { label };
}
