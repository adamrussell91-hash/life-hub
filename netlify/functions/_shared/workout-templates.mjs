export const TEMPLATES_PREFIX = 'data/fitness/templates/';
export const TEMPLATE_PATH = /^data\/fitness\/templates\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const MAX_PROMPT_TEMPLATES = 50;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

export function slugifyWorkoutTitle(title) {
  return String(title ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'workout';
}

export function templatePathForTitle(title) {
  return `${TEMPLATES_PREFIX}${slugifyWorkoutTitle(title)}.md`;
}

export function isTemplatePath(path) {
  return typeof path === 'string' && TEMPLATE_PATH.test(path);
}

export function buildTemplateRecord(session, sourceSessionDate) {
  const source = session && typeof session === 'object' ? session : {};
  return {
    schema_version: 1,
    type: 'workout_template',
    title: source.title,
    session_kind: source.session_kind,
    day_type: source.day_type,
    focus: Array.isArray(source.focus) ? source.focus : [],
    source_session_date: sourceSessionDate,
    exercises: (Array.isArray(source.exercises) ? source.exercises : []).map(exercise => ({
      name: exercise?.name,
      ...(exercise?.bench_angle_deg != null ? { bench_angle_deg: exercise.bench_angle_deg } : {}),
      ...(exercise?.intensification != null ? { intensification: exercise.intensification } : {}),
      sets: (Array.isArray(exercise?.sets) ? exercise.sets : []).map(set => ({
        reps: set?.reps,
        weight_kg: set?.weight_kg,
        cable_type: set?.cable_type
      }))
    }))
  };
}

export function renderTemplateMarkdown(template) {
  const frontmatter = Object.entries(template ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n');
  return `---\n${frontmatter}\n---\n`;
}

export function parseTemplateMarkdown(text) {
  const match = FRONTMATTER.exec(String(text ?? '').trim());
  if (!match) return null;

  const record = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (!key || !raw) continue;
    try {
      record[key] = JSON.parse(raw);
    } catch {
      // Skip a malformed line rather than discarding the rest of an otherwise-readable template.
    }
  }
  return record;
}

// "Let's do X again" only works if the prompt carries the actual prescription, not just a
// title -- so the most recently-used templates get their full exercise/set list; the rest
// stay one line each to keep prompt size in check.
const DETAILED_TEMPLATE_COUNT = 5;

function templateSummaryLine(template) {
  return `- ${template.title} (${template.session_kind ?? 'unknown'}, last actuals from ${template.source_session_date ?? 'n/a'})`;
}

function formatTemplateSet(set) {
  const reps = set?.reps ?? '?';
  const weight = set?.weight_kg ?? '?';
  const cableType = set?.cable_type ?? 'n/a';
  return `${reps}x${weight}kg (${cableType})`;
}

function templateDetailLines(template) {
  const exercises = Array.isArray(template.exercises) ? template.exercises : [];
  const exerciseLines = exercises.map(exercise => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
    const setSummary = sets.length ? sets.map(formatTemplateSet).join(', ') : 'no logged sets';
    const intensification = exercise?.intensification ? ` [${exercise.intensification}]` : '';
    return `    · ${exercise?.name ?? 'unnamed move'}${intensification}: ${setSummary}`;
  });
  return [`${templateSummaryLine(template)}:`, ...exerciseLines];
}

export function formatTemplatesForPrompt(templates) {
  if (!Array.isArray(templates) || templates.length === 0) return '';
  const ordered = templates
    .slice()
    .sort((a, b) => String(b.source_session_date ?? '').localeCompare(String(a.source_session_date ?? '')))
    .slice(0, MAX_PROMPT_TEMPLATES);

  return ordered
    .map((template, index) => (
      index < DETAILED_TEMPLATE_COUNT
        ? templateDetailLines(template).join('\n')
        : templateSummaryLine(template)
    ))
    .join('\n');
}

export function summarizeTemplatesFromContents(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(entry => parseTemplateMarkdown(entry?.content))
    .filter(record => record && typeof record.title === 'string' && record.title.trim() !== '');
}
