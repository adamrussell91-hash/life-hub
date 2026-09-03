export const TOPIC_VOCABULARY = [
  'Learning Science and Cognition',
  'Motivation and Self Regulation',
  'Pedagogy and Instructional Design',
  'Assessment Feedback and Evaluation',
  'Curriculum Differentiation and Enrichment',
  'High Potential and High Ability Education',
  'Child and Adolescent Development',
  'Wellbeing Mental Health and Trauma',
  'Neurodiversity Inclusion and Disability',
  'Literacy Language and Communication',
  'Critical Creative and Higher Order Thinking',
  'Research Methods and Evidence Literacy',
  'Educational Leadership and Change',
  'Policy Ethics and Governance',
  'Technology AI and Digital Learning',
  'Sociocultural Diversity and Equity',
  'Classroom Culture and Engagement',
  'Teacher Practice and Professional Learning',
  'Higher Education and Academic Practice',
  'Philosophy Knowledge and Society'
];

const LOOKUP = new Map(TOPIC_VOCABULARY.map(tag => [tag.toLowerCase(), tag]));
const MAX_TOPIC_TAGS = 3;

export function canonicalTopicTag(tag) {
  return typeof tag === 'string' ? LOOKUP.get(tag.trim().toLowerCase()) ?? null : null;
}

function uniqueCaseInsensitive(tags) {
  const seen = new Set();
  return tags.filter(tag => {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeTopicTags(tags) {
  return uniqueCaseInsensitive(
    (Array.isArray(tags) ? tags : []).map(canonicalTopicTag).filter(Boolean)
  ).slice(0, MAX_TOPIC_TAGS);
}

export function applyTopicTags(existing, proposed) {
  const structural = uniqueCaseInsensitive(
    (Array.isArray(existing) ? existing : [])
      .map(tag => String(tag ?? '').trim())
      .filter(tag => tag && !canonicalTopicTag(tag))
  );
  return [...structural, ...normalizeTopicTags(proposed)];
}
