import { techniqueById } from '../../../packages/walkthrus/catalogue.mjs';
import { filterBlocksForStudent, isTeacherOnlyBlock, sanitizeBlocksDeep } from './teaching-student.mjs';

// A read-only sheet made from a meeting. The builder copies across only what is
// listed here: attendees, tasks, promises, links and guides never reach it, and
// the result holds no meeting id or person ref.

export const SHEET_SCHEMA_VERSION = 1;
const TITLE_MAX = 200;
const MESSAGE_MAX = 1000;
const FROM_MAX = 120;

const TOKEN = /^[a-f0-9]{48}$/;
export const isSheetToken = (value) => typeof value === 'string' && TOKEN.test(value);
export const SHEET_SNAPSHOT_PREFIX = 'meeting-sheets/';
export const sheetSnapshotKey = (token) => `${SHEET_SNAPSHOT_PREFIX}${token}`;
export const sheetShareKey = (meetingId) => `meeting-sheet-shares/${meetingId}`;

/** Blocks a reader can read and nothing more. Anything that takes an answer stays off the sheet. */
const READ_ONLY_BLOCKS = new Set([
  'rich_text', 'heading', 'callout', 'quote', 'divider', 'definition', 'code',
  'image', 'gallery', 'video', 'embed', 'audio', 'attachment',
  'accordion', 'table', 'timeline', 'card_stack',
  'chart', 'equation', 'diagram', 'mind_map', 'concept_map', 'spacer'
]);

/** Minutes sections that hold what the sheet leaves out, whatever the source document called them. */
const LEFT_OUT_MINUTES = /\b(attend\w*|present|apolog\w*|absent|actions?|tasks?|promises?|follow[- ]?ups?)\b/i;

const PROMISE_ITEM = /<(p|li)\b[^>]*>\s*(?:<[^>]+>\s*)*»[\s\S]*?<\/\1>/gi;
const PROMISE_LINE = /^\s*»/;

const clip = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function childLists(block) {
  if (block?.block_type === 'section') return [block.content?.blocks];
  if (block?.block_type === 'columns') return (block.content?.columns ?? []).map((col) => col.blocks);
  if (block?.block_type === 'tabs') return (block.content?.tabs ?? []).map((tab) => tab.blocks);
  return [];
}

function annotationBlocks(blocks, out = []) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block?.block_type === 'annotation') out.push(block);
    for (const list of childLists(block)) annotationBlocks(list, out);
  }
  return out;
}

function hasVisibleText(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}

/** What this meeting can put on a sheet, for the tick list. */
export function sheetOptions(meeting) {
  const notes = (meeting.blocks ?? []).some((block) => block?.block_type !== 'annotation');
  const annotations = annotationBlocks(meeting.blocks);
  const layers = new Map();
  for (const block of annotations) {
    for (const layer of block.content?.layers ?? []) {
      if (!layer?.id || layer.kind === 'voice' || layers.has(layer.id)) continue;
      layers.set(layer.id, { id: layer.id, name: layer.name, colour: layer.colour, private: layer.kind === 'teacher' });
    }
  }
  return {
    title: meeting.title ?? '',
    summary: hasVisibleText(meeting.notes),
    notes,
    annotations: annotations.length > 0,
    voice: annotations.some((block) => (block.content?.voice_tracks ?? []).length > 0),
    minutes: (meeting.minutes?.sections ?? []).length > 0 || (meeting.minutes_notes ?? []).some((note) => hasVisibleText(note.text)),
    coaching: (meeting.coaching_sheets ?? []).length > 0,
    layers: [...layers.values()]
  };
}

/** Ticks as they should start: everything on, apart from private layers and coaching sheets. */
export function defaultPicks(meeting) {
  const options = sheetOptions(meeting);
  return {
    title: options.title,
    message: '',
    from: '',
    summary: true,
    notes: true,
    annotations: true,
    voice: true,
    minutes: true,
    coaching: false,
    off_layers: options.layers.filter((layer) => layer.private).map((layer) => layer.id)
  };
}

export function normalizePicks(meeting, input) {
  const base = defaultPicks(meeting);
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const flag = (key) => (typeof value[key] === 'boolean' ? value[key] : base[key]);
  return {
    title: clip(value.title, TITLE_MAX) || base.title,
    message: clip(value.message, MESSAGE_MAX),
    from: clip(value.from, FROM_MAX),
    summary: flag('summary'),
    notes: flag('notes'),
    annotations: flag('annotations'),
    voice: flag('voice'),
    minutes: flag('minutes'),
    coaching: flag('coaching'),
    off_layers: Array.isArray(value.off_layers)
      ? value.off_layers.filter((id) => typeof id === 'string').slice(0, 200)
      : base.off_layers
  };
}

function cleanAnnotation(block, picks, tally) {
  const off = new Set(picks.off_layers);
  const layersIn = block.content?.layers ?? [];
  if (!picks.voice) {
    for (const layer of layersIn) if (layer?.kind === 'voice') off.add(layer.id);
  }
  const tracksIn = block.content?.voice_tracks ?? [];
  const onLayer = (track) => !off.has(track?.layer_id);
  const voice_tracks = picks.voice ? tracksIn.filter((track) => track?.status === 'published' && onLayer(track)) : [];
  if (picks.voice) tally.voice_unpublished += tracksIn.filter((track) => track?.status !== 'published' && onLayer(track)).length;
  const { exemplar: _exemplar, anthology: _anthology, ...content } = block.content ?? {};
  // A ticked private layer is one the sender chose to show, so readers get it as an ordinary layer.
  const layers = layersIn.filter((layer) => !off.has(layer?.id)).map((layer) => (layer.kind === 'teacher' ? { ...layer, kind: 'free' } : layer));
  // Layers up to the default start ticked. The sender's notes are the point of a sheet, so all of them do.
  const lastLayer = layers.filter((layer) => layer.kind !== 'voice').pop();
  return {
    ...block,
    content: {
      ...content,
      settings: { ...content.settings, default_layer_id: lastLayer?.id },
      layers,
      annotations: (block.content?.annotations ?? [])
        .filter((ann) => !off.has(ann?.layer_id))
        .map((ann) => ({
          ...ann,
          body: {
            ...ann.body,
            attachments: (ann.body?.attachments ?? []).filter((att) => att?.kind !== 'block')
          }
        })),
      voice_tracks
    }
  };
}

function cleanBlocks(blocks, picks, tally) {
  const out = [];
  for (const raw of Array.isArray(blocks) ? blocks : []) {
    if (!raw || typeof raw !== 'object') continue;
    const block = { ...raw, visibility: raw.visibility ?? 'student_teacher' };
    if (isTeacherOnlyBlock(block)) {
      if (picks.notes) tally.blocks += 1;
      continue;
    }
    if (block.block_type === 'annotation') {
      if (picks.annotations) out.push(cleanAnnotation(block, picks, tally));
      continue;
    }
    if (block.block_type === 'section') {
      const inner = cleanBlocks(block.content?.blocks, picks, tally);
      if (inner.length) out.push({ ...block, content: { ...block.content, blocks: inner } });
      continue;
    }
    if (block.block_type === 'columns') {
      const columns = (block.content?.columns ?? []).map((col) => ({ ...col, blocks: cleanBlocks(col.blocks, picks, tally) }));
      if (columns.some((col) => col.blocks.length)) out.push({ ...block, content: { ...block.content, columns } });
      continue;
    }
    if (block.block_type === 'tabs') {
      const tabs = (block.content?.tabs ?? []).map((tab) => ({ ...tab, blocks: cleanBlocks(tab.blocks, picks, tally) }));
      if (tabs.some((tab) => tab.blocks.length)) out.push({ ...block, content: { ...block.content, tabs } });
      continue;
    }
    if (!picks.notes) continue;
    if (!READ_ONLY_BLOCKS.has(block.block_type)) {
      tally.blocks += 1;
      continue;
    }
    if (block.block_type === 'rich_text') {
      const before = String(block.content?.html ?? '');
      const html = before.replace(PROMISE_ITEM, () => {
        tally.promise_lines += 1;
        return '';
      });
      if (!hasVisibleText(html)) continue;
      out.push({ ...block, content: { ...block.content, html } });
      continue;
    }
    out.push(block);
  }
  return out;
}

function withoutPromiseLines(text, tally) {
  const kept = [];
  for (const line of String(text ?? '').split('\n')) {
    if (PROMISE_LINE.test(line)) tally.promise_lines += 1;
    else kept.push(line);
  }
  return kept.join('\n').trim();
}

function buildMinutes(meeting, tally) {
  const items = [];
  for (const section of meeting.minutes?.sections ?? []) {
    if (LEFT_OUT_MINUTES.test(section?.heading ?? '')) {
      tally.minutes_sections += 1;
      continue;
    }
    const text = withoutPromiseLines(section?.text, tally);
    if (text) items.push({ heading: clip(section?.heading, TITLE_MAX), text });
  }
  for (const note of meeting.minutes_notes ?? []) {
    if (LEFT_OUT_MINUTES.test(note?.heading ?? '')) continue;
    const text = withoutPromiseLines(note?.text, tally);
    if (text) items.push({ heading: clip(note?.heading, TITLE_MAX), text });
  }
  return items;
}

function buildCoaching(meeting) {
  return (meeting.coaching_sheets ?? []).map((sheet) => {
    const steps = Object.keys(sheet?.steps ?? {})
      .sort()
      .map((key) => ({ step: key, seen: clip(sheet.steps[key]?.seen, 600), next: clip(sheet.steps[key]?.next, 600) }));
    return { technique: techniqueById(sheet?.technique_id)?.name ?? 'Technique', steps };
  });
}

/**
 * The sheet for these ticks, and a count of what was left off so the sender can
 * see it. The sheet is what the public link serves, so nothing else belongs on it.
 */
export function buildSheet(meeting, pickInput, { now = () => new Date().toISOString() } = {}) {
  const picks = normalizePicks(meeting, pickInput);
  const tally = { blocks: 0, promise_lines: 0, minutes_sections: 0, voice_unpublished: 0 };
  const cleaned = cleanBlocks(meeting.blocks, picks, tally);
  const blocks = sanitizeBlocksDeep(filterBlocksForStudent(cleaned));
  const sheet = {
    schema_version: SHEET_SCHEMA_VERSION,
    title: picks.title,
    message: picks.message,
    from: picks.from,
    meeting_date: meeting.scheduled_start ?? null,
    time_zone: meeting.time_zone ?? null,
    summary: picks.summary ? withoutPromiseLines(meeting.notes, tally) : '',
    blocks,
    minutes: picks.minutes ? buildMinutes(meeting, tally) : [],
    coaching: picks.coaching ? buildCoaching(meeting) : [],
    shared_at: now()
  };
  return { sheet, picks, left_off: tally };
}
