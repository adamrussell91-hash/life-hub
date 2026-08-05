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

export function formatTemplatesForPrompt(templates) {
  if (!Array.isArray(templates) || templates.length === 0) return '';
  return templates.slice(0, MAX_PROMPT_TEMPLATES).map(template => (
    `- ${template.title} (${template.session_kind ?? 'unknown'}, last actuals from ${template.source_session_date ?? 'n/a'})`
  )).join('\n');
}

export function summarizeTemplatesFromContents(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(entry => parseTemplateMarkdown(entry?.content))
    .filter(record => record && typeof record.title === 'string' && record.title.trim() !== '');
}
