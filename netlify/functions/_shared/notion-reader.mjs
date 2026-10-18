// netlify/functions/_shared/notion-reader.mjs

// PROVISIONAL: these are the plan's defaults. They stay provisional until the
// Task 1 tabs check is run and recorded in the spec ("Tabs check result").
const TAB_CONTAINER_TYPE = 'tab';
const TAB_ITEM_TYPE = 'paragraph';

const NO_DESCEND = new Set(['child_database', 'link_to_page']);

function plain(rich) {
  return (rich ?? []).map((r) => r.plain_text ?? '').join('');
}

function fileRef(f) {
  if (!f) return null;
  if (f.type === 'file' && f.file?.url) return { name: f.name || 'file', url: f.file.url, source: 'file' };
  if (f.type === 'file_upload' && f.file_upload?.url) return { name: f.name || 'file', url: f.file_upload.url, source: 'file' };
  if (f.type === 'external' && f.external?.url) return { name: f.name || 'file', url: f.external.url, source: 'external' };
  return null;
}

function prop(page, name) {
  return page.properties?.[name];
}

export function normalizePage(page, blocks, childIds) {
  const titleProp = Object.values(page.properties ?? {}).find((p) => p?.type === 'title');
  const multi = (name) => (prop(page, name)?.multi_select ?? []).map((o) => o.name);
  const date = prop(page, 'Date/s')?.date;
  return {
    id: page.id,
    url: page.url ?? '',
    last_edited_time: page.last_edited_time,
    title: plain(titleProp?.title),
    category: prop(page, 'Category')?.select?.name ?? null,
    subjects: multi('Subject'),
    years: multi('Year Level'),
    outcomes: multi('Outcomes'),
    date_start: date?.start ?? null,
    date_end: date?.end ?? null,
    files: (prop(page, 'Files')?.files ?? []).map(fileRef).filter(Boolean),
    cover: fileRef(page.cover ? { ...page.cover, name: 'cover' } : null),
    blocks,
    child_ids: childIds ?? (prop(page, 'Sub-item')?.relation ?? []).map((r) => r.id)
  };
}

function normalizeTabs(raw, children) {
  if (!TAB_CONTAINER_TYPE || raw.type !== TAB_CONTAINER_TYPE) return null;
  if (!children.length || !children.every((c) => c.type === TAB_ITEM_TYPE)) return null;
  return {
    id: raw.id,
    type: 'tabs',
    data: {},
    children: children.map((c, k) => ({
      id: c.id,
      type: 'tab',
      data: { label: plain(c.data.rich_text) || `Tab ${k + 1}` },
      children: c.children
    }))
  };
}

async function readBlocks(client, blockId) {
  const raws = await client.listChildren(blockId);
  const out = [];
  for (const raw of raws) {
    const children = raw.has_children && !NO_DESCEND.has(raw.type) ? await readBlocks(client, raw.id) : [];
    const node = { id: raw.id, type: raw.type, data: raw[raw.type] ?? {}, children };
    out.push(normalizeTabs(raw, children) ?? node);
  }
  return out;
}

async function subItemIds(client, page) {
  const rel = prop(page, 'Sub-item');
  if (!rel) return [];
  if (!rel.has_more) return (rel.relation ?? []).map((r) => r.id);
  const items = await client.propertyItems(page.id, rel.id);
  return items.map((item) => item.relation?.id).filter(Boolean);
}

export async function readNotionTree(client, rootId, { maxPages = 200 } = {}) {
  const pages = {};
  const queue = [rootId];
  let rootKey = null;
  while (queue.length) {
    const id = queue.shift();
    // Cheap pre-check for ids already in dashed form; also guards relation cycles.
    if (pages[id]) continue;
    if (Object.keys(pages).length >= maxPages) {
      throw new Error(`This import has more than ${maxPages} pages. Import a smaller part.`);
    }
    const raw = await client.getPage(id);
    // Key by the id Notion returns (dashed), not the id we asked for.
    if (pages[raw.id]) continue;
    const childIds = await subItemIds(client, raw);
    const blocks = await readBlocks(client, raw.id);
    pages[raw.id] = normalizePage(raw, blocks, childIds);
    if (rootKey === null) rootKey = raw.id;
    queue.push(...childIds);
  }
  return { root_id: rootKey, pages };
}
