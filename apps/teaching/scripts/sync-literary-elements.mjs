#!/usr/bin/env node
/**
 * Hand-run sync: widgets Periodic Table HTML → src/data/literary-elements.json.
 *
 * Usage:
 *   node scripts/sync-literary-elements.mjs [path-or-url]
 *
 * Default source: sibling checkout or a downloaded HTML path.
 * Not part of the build. Existing technique ids and symbols are preserved;
 * only new techniques get freshly generated symbols.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../src/data/literary-elements.json');
const DEFAULT_SOURCE = path.resolve(
  '/tmp/widgets-pt/Periodic-Table-of-Literary-Elements.html'
);

const FAMILY_KEY = {
  Descriptive: 'Descriptive',
  Repetitive: 'Repetitive',
  Comparative: 'Comparative',
  Structural: 'Structural',
  'Intertextual & Metafictional': 'Intertextual'
};

function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Same candidate order as the widgets page `gen()`. */
function generateSymbol(name, used) {
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '');
  let base = name
    .replace(/\(.*?\)/g, '')
    .replace(/&.*/, '')
    .replace(/[^A-Za-z ]/g, '')
    .trim();
  const words = base.split(/\s+/).filter(Boolean);
  const w0 = words[0] || name;
  const cands = [
    w0.slice(0, 2),
    w0[0] + (w0[2] || ''),
    w0[0] + (w0[3] || ''),
    words[1] ? w0[0] + words[1][0] : '',
    w0.slice(0, 3),
    w0[0] + w0.slice(2, 4),
    w0[0] + (w0[4] || ''),
    words[1] ? w0[0] + words[1].slice(0, 2) : '',
    w0.slice(0, 4)
  ]
    .filter((c) => c && c.length >= 2)
    .map(cap);
  for (const c of cands) {
    if (!used.has(c)) {
      used.add(c);
      return c;
    }
  }
  let i = 2;
  let s;
  do {
    s = cap(w0.slice(0, 1)) + i;
    i += 1;
  } while (used.has(s));
  used.add(s);
  return s;
}

async function loadHtml(source) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch ${source}: ${res.status}`);
    return res.text();
  }
  const filePath = path.resolve(source);
  if (!existsSync(filePath)) {
    throw new Error(`Source not found: ${filePath}`);
  }
  return readFileSync(filePath, 'utf8');
}

function extractTaxonomy(html) {
  const start = html.indexOf('const FAMILY_ORDER');
  const end = html.indexOf('/* =====', html.indexOf('const taxonomyRoot'));
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not locate FAMILY_ORDER / taxonomyRoot in HTML');
  }
  // Include T() helper defined just above taxonomyRoot.
  const tFn = html.indexOf('function T(');
  const sliceStart = tFn >= 0 && tFn < start ? tFn : start;
  const code = `${html.slice(sliceStart, end)}\n;({ FAMILY_ORDER, FAMILY_COLORS, taxonomyRoot });`;
  const sandbox = { console };
  const result = vm.runInNewContext(code, sandbox, { timeout: 5000 });
  if (!result?.taxonomyRoot || !result?.FAMILY_COLORS) {
    throw new Error('Evaluated data section did not yield taxonomyRoot / FAMILY_COLORS');
  }
  return result;
}

function loadPrevious() {
  if (!existsSync(OUT)) return null;
  try {
    return JSON.parse(readFileSync(OUT, 'utf8'));
  } catch {
    return null;
  }
}

function buildSnapshot(data, previous, sourceLabel, sourceSha) {
  const previousById = new Map(
    (previous?.techniques ?? []).map((t) => [t.id, t])
  );
  const usedSymbols = new Set();

  const families = [];
  const subgroups = [];
  const techniques = [];
  const nameToId = new Map();
  let droppedRelated = 0;

  for (const fam of data.taxonomyRoot.children) {
    const key = FAMILY_KEY[fam.name];
    if (!key) throw new Error(`Unknown family display name: ${fam.name}`);
    const colour = data.FAMILY_COLORS[fam.name];
    if (!colour) throw new Error(`Missing FAMILY_COLORS entry for ${fam.name}`);
    families.push({ key, name: fam.name, colour });

    for (const sg of fam.children || []) {
      const sgId = slugify(`${key}-${sg.name}`);
      subgroups.push({
        id: sgId,
        family: key,
        name: sg.name,
        definition: sg.info?.definition ?? ''
      });

      for (const tech of sg.techniques || []) {
        const id = slugify(tech.name);
        const prior = previousById.get(id);
        let symbol;
        if (prior?.symbol && !usedSymbols.has(prior.symbol)) {
          symbol = prior.symbol;
          usedSymbols.add(symbol);
        } else {
          symbol = generateSymbol(tech.name, usedSymbols);
        }

        nameToId.set(tech.name.toLowerCase(), id);
        techniques.push({
          id,
          symbol,
          name: tech.name,
          subgroup: sgId,
          definition: tech.info?.definition ?? '',
          effect: tech.info?.effect ?? '',
          example: tech.info?.example ?? '',
          relatedNames: tech.info?.related ?? []
        });
      }
    }
  }

  const resolved = techniques.map((tech) => {
    const related = [];
    for (const name of tech.relatedNames) {
      const id = nameToId.get(String(name).toLowerCase());
      if (id) related.push(id);
      else {
        droppedRelated += 1;
        console.warn(`Dropped unresolved related "${name}" on ${tech.name}`);
      }
    }
    const { relatedNames: _drop, ...rest } = tech;
    return { ...rest, related };
  });

  const familyCount = families.length;
  const subgroupCount = subgroups.length;
  const techniqueCount = resolved.length;
  if (familyCount !== 5) {
    throw new Error(`Expected 5 families, got ${familyCount}`);
  }
  if (subgroupCount !== 21) {
    throw new Error(`Expected 21 subgroups, got ${subgroupCount}`);
  }
  if (techniqueCount < 280 || techniqueCount > 340) {
    throw new Error(`Technique count ${techniqueCount} outside 280–340`);
  }

  const ids = new Set();
  const symbols = new Set();
  for (const tech of resolved) {
    if (ids.has(tech.id)) throw new Error(`Duplicate technique id: ${tech.id}`);
    if (symbols.has(tech.symbol)) {
      throw new Error(`Duplicate technique symbol: ${tech.symbol}`);
    }
    ids.add(tech.id);
    symbols.add(tech.symbol);
  }

  const contentHash = createHash('sha1')
    .update(JSON.stringify({ families, subgroups, techniques: resolved }))
    .digest('hex')
    .slice(0, 12);

  const snapshot = {
    version: `widgets@${sourceSha || contentHash}`,
    source: sourceLabel,
    synced_at: new Date().toISOString(),
    families,
    subgroups,
    techniques: resolved
  };

  return { snapshot, droppedRelated, previousCount: previous?.techniques?.length ?? 0 };
}

function diffSummary(previous, next) {
  const prevIds = new Set((previous?.techniques ?? []).map((t) => t.id));
  const nextIds = new Set(next.techniques.map((t) => t.id));
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));
  const symbolChanges = [];
  for (const tech of next.techniques) {
    const prior = (previous?.techniques ?? []).find((t) => t.id === tech.id);
    if (prior && prior.symbol !== tech.symbol) {
      symbolChanges.push(`${tech.id}: ${prior.symbol} → ${tech.symbol}`);
    }
  }
  return { added, removed, symbolChanges };
}

async function main() {
  const sourceArg = process.argv[2] || DEFAULT_SOURCE;
  const html = await loadHtml(sourceArg);
  const sourceSha =
    process.env.WIDGETS_SHA ||
    createHash('sha1').update(html).digest('hex').slice(0, 12);
  const data = extractTaxonomy(html);
  const previous = loadPrevious();
  const { snapshot, droppedRelated, previousCount } = buildSnapshot(
    data,
    previous,
    typeof sourceArg === 'string' && sourceArg.includes('widgets')
      ? `widgets@${sourceSha}`
      : path.basename(String(sourceArg)),
    sourceSha
  );
  const diff = diffSummary(previous, snapshot);

  writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(
    [
      `Wrote ${OUT}`,
      `families=${snapshot.families.length}`,
      `subgroups=${snapshot.subgroups.length}`,
      `techniques=${snapshot.techniques.length}`,
      `previous=${previousCount}`,
      `added=${diff.added.length}`,
      `removed=${diff.removed.length}`,
      `symbolChanges=${diff.symbolChanges.length}`,
      `droppedRelated=${droppedRelated}`,
      `version=${snapshot.version}`
    ].join('  ')
  );
  if (diff.added.length) console.log('Added:', diff.added.slice(0, 20).join(', '));
  if (diff.removed.length) console.log('Removed:', diff.removed.slice(0, 20).join(', '));
  if (diff.symbolChanges.length) {
    console.log('Symbol changes:', diff.symbolChanges.slice(0, 20).join('; '));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
