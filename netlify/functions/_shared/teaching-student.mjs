export function attachedOutcomeIds(record = {}) {
  if (Array.isArray(record.outcome_ids) && record.outcome_ids.length > 0) {
    return record.outcome_ids.filter(id => typeof id === 'string' && id);
  }
  if (Array.isArray(record.syllabus_outcomes) && record.syllabus_outcomes.length > 0) {
    return record.syllabus_outcomes.filter(id => typeof id === 'string' && id);
  }
  return [];
}

export function toPublicOutcome(outcome) {
  if (!outcome || typeof outcome !== 'object') return null;
  if (!outcome.id || !outcome.code || !outcome.title) return null;
  return {
    id: outcome.id,
    code: outcome.code,
    title: outcome.title,
    description: outcome.description,
    group: outcome.group,
    source: outcome.source
  };
}

export function filterBlocksForStudent(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter(block => block?.visibility === 'student_teacher')
    .map(block => {
      if (block.block_type === 'section') {
        return {
          ...block,
          content: {
            ...block.content,
            blocks: filterBlocksForStudent(block.content?.blocks)
          }
        };
      }
      if (block.block_type === 'columns') {
        return {
          ...block,
          content: {
            ...block.content,
            columns: (block.content?.columns ?? []).map(col => ({
              ...col,
              blocks: filterBlocksForStudent(col.blocks)
            }))
          }
        };
      }
      if (block.block_type === 'tabs') {
        return {
          ...block,
          content: {
            tabs: (block.content?.tabs ?? []).map(panel => ({
              ...panel,
              blocks: filterBlocksForStudent(panel.blocks)
            }))
          }
        };
      }
      return block;
    });
}

export function sanitizeRichTextHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*(["']?)\s*javascript:[^"'>\s]*/gi, 'href=$1');
}

export function sanitizeBlocksDeep(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map(block => {
    if (block.block_type === 'rich_text' || block.block_type === 'html') {
      return {
        ...block,
        content: { html: sanitizeRichTextHtml(block.content?.html) }
      };
    }
    if (block.block_type === 'section') {
      return {
        ...block,
        content: {
          ...block.content,
          blocks: sanitizeBlocksDeep(block.content?.blocks)
        }
      };
    }
    if (block.block_type === 'columns') {
      return {
        ...block,
        content: {
          ...block.content,
          columns: (block.content?.columns ?? []).map(col => ({
            ...col,
            blocks: sanitizeBlocksDeep(col.blocks)
          }))
        }
      };
    }
    if (block.block_type === 'tabs') {
      return {
        ...block,
        content: {
          tabs: (block.content?.tabs ?? []).map(panel => ({
            ...panel,
            blocks: sanitizeBlocksDeep(panel.blocks)
          }))
        }
      };
    }
    return block;
  });
}

export function orderLessonsByUnitIds(lessonIds, lessons) {
  const byId = new Map(lessons.map(lesson => [lesson.lesson_id, lesson]));
  const ordered = [];
  for (const id of lessonIds) {
    const hit = byId.get(id);
    if (hit) {
      ordered.push(hit);
      byId.delete(id);
    }
  }
  const rest = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
  return [...ordered, ...rest];
}

export function findBlockById(blocks, id) {
  if (!Array.isArray(blocks)) return null;
  for (const block of blocks) {
    if (block?.id === id) return block;
    if (block?.block_type === 'section') {
      const found = findBlockById(block.content?.blocks, id);
      if (found) return found;
    } else if (block?.block_type === 'columns') {
      for (const col of block.content?.columns ?? []) {
        const found = findBlockById(col.blocks, id);
        if (found) return found;
      }
    } else if (block?.block_type === 'tabs') {
      for (const tab of block.content?.tabs ?? []) {
        const found = findBlockById(tab.blocks, id);
        if (found) return found;
      }
    }
  }
  return null;
}

const HTML_APP_AI_MAX_MESSAGES = 20;
const HTML_APP_AI_MAX_CONTENT_CHARS = 16_000;
const HTML_APP_AI_MAX_TOKENS_CAP = 2000;

export function resolveHtmlAppAiLane(block) {
  if (block?.block_type !== 'html_app' || !block.content?.ai) return null;
  const ai = block.content.ai;
  const model = typeof ai.model === 'string' ? ai.model.trim() : '';
  const system = typeof ai.system === 'string' ? ai.system : '';
  if (!model || !system.trim()) return null;
  return {
    provider: ai.provider === 'openai' ? 'openai' : 'anthropic',
    model,
    system,
    max_tokens: Math.min(Number(ai.max_tokens) || 0, HTML_APP_AI_MAX_TOKENS_CAP)
  };
}

export function clampHtmlAppAiRequest(messages) {
  const sliced = messages.slice(-HTML_APP_AI_MAX_MESSAGES).map(message => ({
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: typeof message?.content === 'string' ? message.content : ''
  }));
  let total = 0;
  const out = [];
  for (const message of sliced) {
    const room = HTML_APP_AI_MAX_CONTENT_CHARS - total;
    if (room <= 0) break;
    const content = message.content.length > room ? message.content.slice(0, room) : message.content;
    total += content.length;
    out.push({ role: message.role, content });
  }
  return out;
}

export function buildPublishedClass({
  cls,
  units,
  lessons,
  scheduled,
  publishedLessonIds
}) {
  const unitById = new Map(units.map(unit => [unit.id, unit]));
  const lessonById = new Map(lessons.map(lesson => [lesson.id, lesson]));

  let current_unit;
  if (cls.current_unit_id) {
    const unit = unitById.get(cls.current_unit_id);
    if (unit) {
      const lessonsForUnit = (unit.lesson_ids ?? [])
        .map(lessonId => {
          if (!publishedLessonIds.has(lessonId)) return null;
          const lesson = lessonById.get(lessonId);
          return lesson ? { id: lesson.id, title: lesson.title } : null;
        })
        .filter(Boolean);
      current_unit = {
        id: unit.id,
        title: unit.title,
        lessons: lessonsForUnit,
        ...(unit.cover ? { cover: unit.cover } : {})
      };
    }
  }

  let current_lesson;
  if (cls.current_scheduled_lesson_id) {
    const row = scheduled.find(entry => entry.id === cls.current_scheduled_lesson_id);
    if (row) {
      const lesson = lessonById.get(row.lesson_id);
      if (lesson) {
        current_lesson = {
          id: row.id,
          title: lesson.title,
          lesson_id: row.lesson_id
        };
      }
    }
  }

  const schedule = [...scheduled]
    .sort((a, b) => (a.schedule_order ?? 0) - (b.schedule_order ?? 0))
    .map(row => {
      const lesson = lessonById.get(row.lesson_id);
      return {
        id: row.id,
        date: row.date,
        schedule_order: row.schedule_order,
        lesson_id: row.lesson_id,
        unit_id: row.unit_id,
        title: lesson?.title ?? row.lesson_id,
        published: publishedLessonIds.has(row.lesson_id),
        delivery_status: row.delivery_status
      };
    });

  const active_units = (cls.active_unit_ids ?? [])
    .map(unitId => {
      const unit = unitById.get(unitId);
      if (!unit) return null;
      return {
        id: unit.id,
        title: unit.title,
        ...(unit.cover ? { cover: unit.cover } : {})
      };
    })
    .filter(Boolean);

  return {
    id: cls.id,
    code: cls.code,
    title: cls.title,
    ...(cls.display_name ? { display_name: cls.display_name } : {}),
    ...(cls.cover ? { cover: cls.cover } : {}),
    homepage: {
      announcements: filterBlocksForStudent(cls.homepage?.announcements),
      resources: filterBlocksForStudent(cls.homepage?.resources),
      custom: filterBlocksForStudent(cls.homepage?.custom)
    },
    ...(current_unit ? { current_unit } : {}),
    ...(current_lesson ? { current_lesson } : {}),
    schedule,
    active_units
  };
}
