/** Twin of apps/teaching/src/blocks/anthology-collect.ts */

const FAMILY_KEYS = [
  'Descriptive',
  'Repetitive',
  'Comparative',
  'Structural',
  'Intertextual'
];

export function normaliseTag(raw, seen) {
  const collapsed = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!collapsed) return null;
  const key = collapsed.toLowerCase();
  const existing = seen.get(key);
  if (existing) return existing;
  seen.set(key, collapsed);
  return collapsed;
}

function normaliseTagList(tags, seen) {
  const out = [];
  for (const tag of tags ?? []) {
    const n = normaliseTag(tag, seen);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function notePlain(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function lineNumbers(text) {
  const map = new Map();
  let n = 0;
  for (const stanza of text?.stanzas ?? []) {
    for (const line of stanza.lines ?? []) {
      n += 1;
      map.set(line.id, n);
    }
  }
  return map;
}

function walkAnnotationBlocks(blocks, visit) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (block.block_type === 'annotation') {
      visit(block);
      continue;
    }
    if (block.block_type === 'section') walkAnnotationBlocks(block.content?.blocks, visit);
    else if (block.block_type === 'columns') {
      for (const col of block.content?.columns ?? []) walkAnnotationBlocks(col.blocks, visit);
    } else if (block.block_type === 'tabs') {
      for (const panel of block.content?.tabs ?? []) walkAnnotationBlocks(panel.blocks, visit);
    }
  }
}

export function collectAnthology(snapshots, ctx = {}) {
  const includeUnpublished = ctx.includeUnpublished === true;
  const themeSeen = new Map();
  const conceptSeen = new Map();
  const items = [];
  const texts = [];

  for (const snap of snapshots ?? []) {
    if (!snap?.published && !includeUnpublished) continue;

    walkAnnotationBlocks(snap.blocks, block => {
      const layers = Array.isArray(block.content?.layers) ? block.content.layers : [];
      const layersById = new Map(layers.map(layer => [layer.id, layer]));
      const numbers = lineNumbers(block.content?.text);
      const fingerprint = {};
      let includedCount = 0;

      for (const ann of block.content?.annotations ?? []) {
        const layer = layersById.get(ann.layer_id);
        if (!layer || layer.kind === 'teacher' || layer.kind === 'voice') continue;

        const tag = ann.anthology;
        const blockTag = block.content?.anthology;
        if (!(tag?.include === true || blockTag?.include === true)) continue;

        const themes = normaliseTagList(
          [...(tag?.themes ?? []), ...(blockTag?.themes ?? [])],
          themeSeen
        );
        const concepts = normaliseTagList(
          [...(tag?.concepts ?? []), ...(blockTag?.concepts ?? [])],
          conceptSeen
        );
        const lineId = typeof ann.anchor?.line === 'string' ? ann.anchor.line : undefined;

        items.push({
          lesson_id: snap.lesson_id,
          lesson_title: snap.lesson_title,
          block_id: block.id,
          annotation_id: ann.id,
          quote: ann.anchor?.quote?.exact ?? '',
          note: notePlain(ann.body?.html),
          line_number: lineId ? (numbers.get(lineId) ?? 0) : 0,
          layer_name: layer.name,
          technique_id: ann.technique?.id,
          themes,
          concepts,
          ...(includeUnpublished ? { published: snap.published } : {})
        });
        includedCount += 1;

        if (ann.technique?.id && layer.kind === 'family' && FAMILY_KEYS.includes(layer.family)) {
          fingerprint[layer.family] = (fingerprint[layer.family] ?? 0) + 1;
        }
      }

      if (includedCount === 0 && block.content?.anthology?.include !== true) return;

      const textIncluded = block.content?.anthology?.include === true;
      const stop_lines = {};
      if (textIncluded) {
        for (const ann of block.content?.annotations ?? []) {
          const layer = layersById.get(ann.layer_id);
          if (!layer || layer.kind === 'teacher' || layer.kind === 'voice') continue;
          if (typeof ann.anchor?.line === 'string') stop_lines[ann.id] = ann.anchor.line;
        }
      }

      texts.push({
        lesson_id: snap.lesson_id,
        block_id: block.id,
        title: (block.content?.title ?? '').trim() || snap.lesson_title,
        attribution: (block.content?.attribution ?? '').trim() || undefined,
        fingerprint,
        text_included: textIncluded,
        ...(textIncluded
          ? {
              poem: structuredClone(block.content.text),
              stop_lines
            }
          : {}),
        ...(includeUnpublished ? { published: snap.published } : {})
      });
    });
  }

  const orderIndex = new Map((ctx.lessonOrder ?? []).map((id, i) => [id, i]));
  texts.sort((a, b) => {
    const ai = orderIndex.get(a.lesson_id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.lesson_id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.title.localeCompare(b.title) || a.block_id.localeCompare(b.block_id);
  });
  items.sort((a, b) => {
    const ai = orderIndex.get(a.lesson_id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.lesson_id) ?? Number.MAX_SAFE_INTEGER;
    return (
      ai - bi ||
      a.block_id.localeCompare(b.block_id) ||
      a.line_number - b.line_number ||
      a.annotation_id.localeCompare(b.annotation_id)
    );
  });

  return { items, texts };
}
