/** Meaning-based Stars symbol choice. Spiral is only for inquiry/methods, never a default. */

export const STARS_TEMPLATE_IDS = ["eye", "bridge", "cycle", "tree", "compass", "spiral"];

export const STARS_TEMPLATE_LABELS = {
  eye: "Eye",
  bridge: "Bridge",
  cycle: "Cycle",
  spiral: "Spiral",
  tree: "Tree",
  compass: "Compass",
};

const CUES = {
  eye: [
    "reading", "literacy", "vision", "perspective", "seeing", "interpret",
    "interpretation", "lens", "observe", "observation", "perception", "attention",
    "insight", "theory", "theories", "framework", "philosophy", "cognition",
    "cognitive", "thinking", "thought", "language", "communication", "discourse",
    "models of reading", "ways of seeing",
  ],
  bridge: [
    "connect", "connection", "transition", "transfer", "mediate", "mediation",
    "between", "across", "linking", "threshold", "boundary", "translate",
    "translation", "interface", "inclusion", "inclusive", "neurodiversity",
    "disability", "diversity", "equity", "sociocultural", "trauma", "wellbeing",
    "well-being", "bridging",
  ],
  cycle: [
    "cycle", "cycles", "development", "developmental", "process", "processes",
    "feedback", "recurrence", "recurring", "phases", "rhythm", "seasonal",
    "motivation", "regulation", "self-regulation", "assessment", "evaluation",
    "adolescent", "engagement", "classroom", "feedback loops",
  ],
  tree: [
    "growth", "growing", "branch", "branching", "differentiate", "differentiation",
    "taxonomy", "hierarchy", "lineage", "classify", "classification", "curriculum",
    "enrichment", "pedagogy", "instructional", "gifted", "talent", "ability",
    "potential", "professional learning",
  ],
  compass: [
    "leadership", "leader", "direction", "decision", "strategy", "strategic",
    "orientation", "navigate", "navigation", "judgement", "judgment", "policy",
    "ethics", "governance", "higher education", "academic practice",
  ],
  spiral: [
    "spiral", "deepen", "deepening", "revise", "revision", "inquiry",
    "iterative inquiry", "refine", "refinement", "research methods",
    "evidence literacy",
  ],
};

const TOPIC_TEMPLATE = {
  "learning science and cognition": "eye",
  "motivation and self regulation": "cycle",
  "pedagogy and instructional design": "tree",
  "assessment feedback and evaluation": "cycle",
  "curriculum differentiation and enrichment": "tree",
  "high potential and high ability education": "tree",
  "child and adolescent development": "cycle",
  "wellbeing mental health and trauma": "bridge",
  "neurodiversity inclusion and disability": "bridge",
  "literacy language and communication": "eye",
  "critical creative and higher order thinking": "eye",
  "research methods and evidence literacy": "spiral",
  "educational leadership and change": "compass",
  "policy ethics and governance": "compass",
  "technology ai and digital learning": "compass",
  "sociocultural diversity and equity": "bridge",
  "classroom culture and engagement": "cycle",
  "teacher practice and professional learning": "tree",
  "higher education and academic practice": "compass",
  "philosophy knowledge and society": "eye",
};

const PAIR_RULES = {
  eye: "Notes 1 through n minus 1 form a closed chain, then connect note n to note 1 and to the middle outline note.",
  bridge: "Chain notes 1 to 2, 2 to 3, continuing through n minus 1 to n.",
  cycle: "The same chain as a bridge, plus n to 1.",
  spiral: "Chain notes 1 to 2, 2 to 3, continuing through n minus 1 to n.",
  tree: "Note 1 is the root; notes 2 and 3 connect to it; each later note connects to the earlier branch at floor of its zero based index divided by 2.",
  compass: "Note 1 is the centre and connects to every other note; when there are more than 5 notes, notes 2 through n also form a closed chain.",
};

function asInput(value) {
  if (typeof value === "string") return { query: value, notes: [] };
  return value && typeof value === "object" ? value : { query: "", notes: [] };
}

function blob(input) {
  const notes = Array.isArray(input.notes) ? input.notes : [];
  return [
    input.query,
    input.title,
    ...notes.flatMap(note => [note?.title, note?.excerpt, note?.role, ...(note?.tags ?? [])]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function tokensOf(text) {
  return text.split(/[^a-z0-9-]+/).filter(Boolean);
}

function cueScore(text, cues) {
  const tokens = tokensOf(text);
  let score = 0;
  for (const cue of cues) {
    if (cue.includes(" ")) {
      if (text.includes(cue)) score += 3;
    } else {
      const hits = tokens.filter(token => token === cue).length;
      if (hits) score += hits * 2;
    }
  }
  return score;
}

function topicScores(notes) {
  const scores = { eye: 0, bridge: 0, cycle: 0, tree: 0, compass: 0, spiral: 0 };
  for (const note of notes ?? []) {
    for (const tag of note?.tags ?? []) {
      const templateId = TOPIC_TEMPLATE[String(tag).trim().toLowerCase()];
      if (templateId) scores[templateId] += 4;
    }
  }
  return scores;
}

function fallbackTemplate(notes) {
  const mapped = [];
  for (const note of notes ?? []) {
    for (const tag of note?.tags ?? []) {
      const templateId = TOPIC_TEMPLATE[String(tag).trim().toLowerCase()];
      if (templateId) mapped.push(templateId);
    }
  }
  const unique = [...new Set(mapped)];
  if (unique.length >= 3) return "tree";
  if (unique.length === 2) return "bridge";
  if (unique[0]) return unique[0];
  return "cycle";
}

export function chooseStarsTemplate(value) {
  const input = asInput(value);
  const text = blob(input);
  const topics = topicScores(input.notes);
  let best = "cycle";
  let bestScore = 0;
  for (const id of STARS_TEMPLATE_IDS) {
    const score = cueScore(text, CUES[id]) + topics[id];
    if (score > bestScore || (score === bestScore && best === "spiral" && score > 0 && id !== "spiral")) {
      best = id;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : fallbackTemplate(input.notes);
}

export function assignedSymbolInstruction(templateId) {
  const id = STARS_TEMPLATE_IDS.includes(templateId) ? templateId : "cycle";
  const label = STARS_TEMPLATE_LABELS[id];
  return [
    `Assigned symbol: ${id} (${label}).`,
    `Set symbol.templateId to "${id}" and symbol.label to "${label}". Do not substitute another template.`,
    PAIR_RULES[id],
    `Write symbol.meaning so it explains why this grouping is a ${label.toLowerCase()} — not a generic spiral of inquiry.`,
  ].join(" ");
}
