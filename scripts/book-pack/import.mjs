#!/usr/bin/env node
// scripts/book-pack/import.mjs
// Turns one section of a private book pack (docs/book-packs/CODEX-BOOK-PREP.md) into a module
// of tool configs built through the Decision Book family factories: a first draft that is
// then finished by hand. It reads only the fields a tool ships (structure labels and the
// pack's own-words coaching) and never facts, anchors, pages, figures, open questions or
// variant notes (which carry PDF page numbers). It refuses to write a string that shares eight
// words in a row with the pack's anchors or pages. Runs locally, never in CI.
//
//   node scripts/book-pack/import.mjs <pack-dir> --section <key> --out <file> [--force]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copiedRun, shinglesOf, shippedStrings } from './copy-check.mjs';

/** The factory for each family the Decision Book families export. */
export const FACTORY_FOR = Object.freeze({
  path: 'pathTool',
  list: 'listTool',
  quadrant: 'quadrantTool',
  curve: 'curveTool',
  scales: 'scalesTool',
  plot: 'plotTool',
  tension: 'tensionTool',
  ratings: 'ratingsTool'
});

const WIDTH = 100;
const IDENT = /^[A-Za-z_$][\w$]*$/;
const camel = (id) => id.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const quote = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

/** A JavaScript literal for plain data: inline when it fits, otherwise one item per line. */
export function toJs(value, indent = '') {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const items = value.map((item) => toJs(item, inner));
    const flat = `[${items.join(', ')}]`;
    return flat.length <= WIDTH && !flat.includes('\n') ? flat : `[\n${items.map((item) => `${inner}${item}`).join(',\n')}\n${indent}]`;
  }
  const items = Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => `${IDENT.test(k) ? k : quote(k)}: ${toJs(v, inner)}`);
  const flat = `{ ${items.join(', ')} }`;
  return flat.length <= WIDTH && !flat.includes('\n') ? flat : `{\n${items.map((item) => `${inner}${item}`).join(',\n')}\n${indent}}`;
}

/** A pack on disk as importSection takes it. */
export function readPack(dir) {
  const book = JSON.parse(readFileSync(join(dir, 'book.json'), 'utf8'));
  const entries = {};
  for (const file of readdirSync(join(dir, 'entries')).filter((name) => name.endsWith('.json'))) {
    const entry = JSON.parse(readFileSync(join(dir, 'entries', file), 'utf8'));
    entries[entry.id] = entry;
  }
  const pageDir = join(dir, 'pages');
  const pages = existsSync(pageDir) ? readdirSync(pageDir).filter((name) => name.endsWith('.txt')).map((name) => readFileSync(join(pageDir, name), 'utf8')) : [];
  return { book, entries, pages };
}

/** The coaching fields a tool ships, in the order a module lists them. */
function coachingOf(entry) {
  return {
    id: entry.id,
    name: entry.title,
    ...(entry.tier === 'lens' ? { tier: 'lens' } : {}),
    when: entry.when,
    failureModes: [...(entry.failureModes ?? [])],
    steps: (entry.steps ?? []).map((s) => ({ id: s.id, title: s.title, prompt: s.prompt })),
    ...(entry.exercise ? { exercise: entry.exercise } : {}),
    ...(entry.pairsWell?.length ? { pairsWell: [...entry.pairsWell] } : {})
  };
}

/** One config as module source: steps through the local `step` helper. */
function configSource(config) {
  const lines = Object.entries(config).map(([key, value]) => {
    if (key !== 'steps') return `  ${key}: ${toJs(value, '  ')}`;
    return `  steps: [\n${value.map((s) => `    step(${quote(s.id)}, ${quote(s.title)}, ${quote(s.prompt)})`).join(',\n')}\n  ]`;
  });
  return `{\n${lines.join(',\n')}\n}`;
}

/**
 * The module for one section: `{ source, report }`. `familiesPath` is the import specifier for
 * the family factories, relative to where the module will live.
 */
export function importSection(pack, sectionKey, { familiesPath }) {
  const sections = pack.book.sections ?? [];
  if (!sections.some((s) => s.key === sectionKey)) throw new Error(`no section ${sectionKey} in book.json`);
  const all = Object.values(pack.entries).filter((e) => e.section === sectionKey);
  const byChapter = (a, b) => (a.printedChapterPages?.[0] ?? 0) - (b.printedChapterPages?.[0] ?? 0);
  const keptEntries = all.filter((e) => e.verdict === 'keep').sort(byChapter);
  const shingles = shinglesOf([...Object.values(pack.entries).flatMap((e) => (e.facts ?? []).map((f) => f.anchor)), ...(pack.pages ?? [])]);

  const report = { built: [], byHand: [], merged: [], cut: [] };
  const used = new Set();
  const blocks = [];
  for (const entry of keptEntries) {
    const factory = !entry.reuse && FACTORY_FOR[entry.family];
    const config = coachingOf(entry);
    if (factory) config.chart = structuredClone(entry.structure ?? {});
    for (const text of shippedStrings(config)) {
      const run = copiedRun(text, shingles);
      if (run) throw new Error(`${entry.id}: copied from the book: "${run}…" (rewrite it in the pack first)`);
    }
    if (factory) {
      used.add(factory);
      report.built.push(entry.id);
      blocks.push(`export const ${camel(entry.id)} = ${factory}(${configSource(config)});`);
    } else {
      report.byHand.push(entry.id);
      const why = entry.reuse ? `Variant of Problem Solver's \`${entry.reuse.tool}\`` : `Proposed family \`${entry.proposedFamily?.name ?? entry.family}\``;
      blocks.push(`// ${why}: finish by hand.\nexport const ${camel(entry.id)}Notes = ${configSource(config)};`);
    }
  }
  // Merged entries are named beside their home, whichever section they came from.
  const homes = new Set(keptEntries.map((e) => e.id));
  const merges = Object.values(pack.entries).filter((e) => e.verdict === 'merge' && homes.has(e.mergeInto)).sort(byChapter);
  for (const e of merges) report.merged.push([e.id, e.mergeInto]);
  for (const e of all.filter((x) => x.verdict === 'cut').sort(byChapter)) report.cut.push(e.id);

  const name = sectionKey.toUpperCase();
  const source = [
    `// Generated by scripts/book-pack/import.mjs from the private book pack, then finished by hand.`,
    `// Section ${sectionKey}: structure labels are the book's short names; every other word is the`,
    `// pack's own-words coaching or ours. No quotation from the book.`,
    ...(used.size ? [`import { ${[...used].sort().join(', ')} } from '${familiesPath}';`] : []),
    '',
    'const step = (id, title, prompt) => ({ id, title, prompt });',
    '',
    blocks.join('\n\n'),
    ...(merges.length ? ['', ...merges.map((e) => `// Merged into ${e.mergeInto}: ${e.id} (fold in by hand).`)] : []),
    '',
    `export const ${name} = Object.freeze({\n${report.built.map((id) => `  ${id}: ${camel(id)}`).join(',\n')}\n});`,
    ''
  ].join('\n');
  return { source, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const dir = args[0] && resolve(args[0]);
  const section = flag('--section');
  const out = flag('--out') && resolve(flag('--out'));
  if (!dir || !existsSync(join(dir, 'entries')) || !section || !out) {
    console.error('Usage: node scripts/book-pack/import.mjs <pack-dir> --section <key> --out <file> [--force]');
    process.exit(2);
  }
  if (existsSync(out) && !args.includes('--force')) {
    console.error(`${out} exists; pass --force to overwrite (hand edits will be lost)`);
    process.exit(1);
  }
  const families = fileURLToPath(new URL('../../packages/decision-book/families/index.mjs', import.meta.url));
  let specifier = relative(dirname(out), families).split('\\').join('/');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  const { source, report } = importSection(readPack(dir), section, { familiesPath: specifier });
  writeFileSync(out, source);
  console.log(`Wrote ${relative(process.cwd(), out)}`);
  console.log(`  built: ${report.built.join(', ') || '-'}`);
  console.log(`  by hand: ${report.byHand.join(', ') || '-'}`);
  for (const [id, home] of report.merged) console.log(`  merge ${id} into ${home}`);
  if (report.cut.length) console.log(`  cut: ${report.cut.join(', ')}`);
}
