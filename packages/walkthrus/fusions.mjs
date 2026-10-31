// packages/walkthrus/fusions.mjs
// A fusion is a technique Adam builds from two or three book techniques (the Adapt step: reorder,
// loop back, link, rename). Its steps start from the book's text, so fusions live only in the
// private board document (walkthrus_board/v1), never in this repository.
import { isTechniqueId, techniqueById } from './catalogue.mjs';
import { isFusionId } from './tiles.mjs';

export const MAX_FUSIONS = 60;
export const MAX_NAME = 60;
export const MAX_WHY = 140;
export const MAX_STEPS = 9;
export const MAX_STEP_LABEL = 60;
export const MAX_STEP_TEXT = 400;
export const MAX_DRAW_NOTE = 200;
export const MAX_DRAWING_SVG = 40_000;
export const SUGGESTED_STEPS = 5;
export const DRAWING_STATUSES = Object.freeze(['none', 'drawn', 'failed']);

const CLUSTER = /^cl_[a-z0-9_]{1,30}$/;

const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const iso = (v) => (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : null);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/**
 * True when an SVG string is safe to put in the page: an <svg> root with no script, no event
 * handlers, no links and no embedded images or foreign HTML. The same rules the figure set keeps.
 */
export function isSafeSvg(svg) {
  if (typeof svg !== 'string' || !svg.length || svg.length > MAX_DRAWING_SVG) return false;
  if (!/^\s*<svg[\s>]/i.test(svg)) return false;
  if (/<\s*(script|image|foreignObject|iframe|object|embed|style|use|a)[\s>/]/i.test(svg)) return false;
  if (/\son[a-z]+\s*=/i.test(svg)) return false;
  if (/href\s*=|javascript:|url\s*\(/i.test(svg)) return false;
  return true;
}

function normalizeDrawing(raw) {
  const none = { status: 'none', scene: null, svg: null, note: null, at: null };
  if (!raw || typeof raw !== 'object') return none;
  const status = DRAWING_STATUSES.includes(raw.status) ? raw.status : 'none';
  const scene = Array.isArray(raw.scene) && raw.scene.length ? raw.scene : null;
  const svg = isSafeSvg(raw.svg) ? raw.svg : null;
  const note = text(raw.note, MAX_DRAW_NOTE) || null;
  const at = iso(raw.at);
  // A drawing without its picture is not drawn.
  if (status === 'drawn' && !svg) return { ...none, status: 'none', note };
  return { status, scene: status === 'drawn' ? scene : null, svg: status === 'drawn' ? svg : null, note, at };
}

function normalizeSteps(raw, parents) {
  const out = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    if (!s || typeof s !== 'object') continue;
    const label = text(s.label, MAX_STEP_LABEL);
    const body = typeof s.text === 'string' ? s.text.trim().slice(0, MAX_STEP_TEXT) : '';
    if (!label && !body) continue;
    const from = s.from && typeof s.from === 'object' && parents.includes(s.from.id) && int(s.from.n, 1, 9) ? { id: s.from.id, n: s.from.n } : null;
    out.push({ label, text: body, from, edited: from ? s.edited === true : false, loop_to: s.loop_to });
    if (out.length >= MAX_STEPS) break;
  }
  // "↻ back to step N" points at another step of this fusion.
  return out.map((s, i) => ({ ...s, loop_to: int(s.loop_to, 1, out.length) && s.loop_to !== i + 1 ? s.loop_to : null }));
}

function normalizeOne(raw) {
  if (!raw || typeof raw !== 'object' || !isFusionId(raw.id)) return null;
  const name = text(raw.name, MAX_NAME);
  if (!name) return null;
  const parents = [];
  for (const id of Array.isArray(raw.parents) ? raw.parents : []) if (isTechniqueId(id) && !parents.includes(id)) parents.push(id);
  if (parents.length < 2 || parents.length > 3) return null;
  const steps = normalizeSteps(raw.steps, parents);
  if (!steps.length) return null;
  return {
    id: raw.id,
    name,
    parents,
    cluster_id: typeof raw.cluster_id === 'string' && CLUSTER.test(raw.cluster_id) ? raw.cluster_id : null,
    steps,
    why: text(raw.why, MAX_WHY),
    drawing: normalizeDrawing(raw.drawing),
    created_at: iso(raw.created_at) ?? new Date(0).toISOString()
  };
}

/** The valid fusions from whatever was sent, one per id, at most MAX_FUSIONS. Junk drops out. */
export function normalizeFusions(value) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const fusion = normalizeOne(raw);
    if (!fusion || seen.has(fusion.id)) continue;
    seen.add(fusion.id);
    out.push(fusion);
    if (out.length >= MAX_FUSIONS) break;
  }
  return out;
}

export const fusionById = (fusions, id) => (Array.isArray(fusions) ? fusions.find((f) => f && f.id === id) ?? null : null);

/** The parents' book numbers (the page in the tile tab), e.g. ['90', '98'] for "90 + 98". */
export const parentCodes = (fusion) => (fusion?.parents ?? []).map((id) => techniqueById(id)?.page).filter((p) => p != null).map(String);
