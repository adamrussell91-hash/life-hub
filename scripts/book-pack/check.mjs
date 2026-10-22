#!/usr/bin/env node
// scripts/book-pack/check.mjs
// Checks a book pack (docs/book-packs/CODEX-BOOK-PREP.md) before Claude builds a tool from it.
// The pack itself lives in the private life-hub-data repo; this script reads it and writes
// nothing. Each entry's structure is built with the real Decision Book family factory, so a
// pack that passes here fits the engine.
//
//   node scripts/book-pack/check.mjs <pack-dir>   check a pack; exit 1 on any error
//   node scripts/book-pack/check.mjs --tools      list existing tools for reuse matching
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { CATALOGUE, FAMILIES } from '../../packages/decision-book/catalogue.mjs';
import { FAMILY_FACTORIES } from '../../packages/decision-book/families/index.mjs';

const TIERS = ['worksheet', 'lens', 'essay'];
const VERDICTS = ['keep', 'merge', 'cut'];
const CHECKS = ['matched', 'corrected', 'unsure'];
const KINDS = ['catalogue', 'process', 'mixed'];
const ROLES = ['structure', 'example', 'illustration', 'decorative'];
const RESERVED_STEPS = ['choose'];
const TAKEN_PREFIXES = ['dm', 'ps'];
const COPY_RUN = 8;
const isKey = (value) => typeof value === 'string' && /^[a-z]+(_[a-z]+)*$/.test(value);
const sentence = (value) => typeof value === 'string' && value.trim().length > 0;

const familyOf = Object.fromEntries(CATALOGUE.map((model) => [model.id, model.family]));

if (process.argv[2] === '--tools') {
  for (const [id, tool] of Object.entries(TOOLS)) {
    const book = id.startsWith('dm_') || familyOf[id] ? 'decision' : 'problem';
    console.log([id, book, familyOf[id] ?? tool.kind ?? '', tool.name].join('\t'));
  }
  process.exit(0);
}

const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir || !existsSync(dir)) {
  console.error('Usage: node scripts/book-pack/check.mjs <pack-dir> | --tools');
  process.exit(2);
}

const errors = [];
const warnings = [];
const err = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

function readJson(path, where) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    err(where, `cannot read JSON (${error.message})`);
    return null;
  }
}

// book.json
const book = readJson(join(dir, 'book.json'), 'book.json') ?? {};
for (const field of ['slug', 'title', 'prefix', 'kind']) if (!sentence(book[field])) err('book.json', `needs ${field}`);
if (book.kind && !KINDS.includes(book.kind)) err('book.json', `kind is one of ${KINDS.join(', ')}`);
if (book.prefix && (!/^[a-z]{2,3}$/.test(book.prefix) || TAKEN_PREFIXES.includes(book.prefix))) {
  err('book.json', `prefix is 2–3 lower-case letters and not ${TAKEN_PREFIXES.join(' or ')}`);
}
if (!Array.isArray(book.authors) || book.authors.length === 0) err('book.json', 'needs authors');
if (!book.pageMap?.method) err('book.json', 'needs pageMap.method');
if (book.pageMap?.method !== 'printed' && (book.pageMap?.evidence?.length ?? 0) < 3) {
  err('book.json', 'a derived page map needs at least three cross-reference checks in pageMap.evidence');
}
const sections = new Map((book.sections ?? []).map((section) => [section.key, section]));
if (sections.size === 0) err('book.json', 'needs sections');
for (const section of sections.values()) {
  if (!isKey(section.key)) err('book.json', `section key "${section.key}" is lower snake case`);
  if (!Array.isArray(section.pages) || section.pages.length !== 2) err('book.json', `section ${section.key} needs [first, last] pages`);
}

// pages: printed numbers, so entries can be checked against them
const pageDir = join(dir, 'pages');
const pageText = new Map();
if (!existsSync(pageDir)) err('pages', 'missing pages/ folder');
else {
  for (const file of readdirSync(pageDir)) {
    const match = /^(\d{3})\.txt$/.exec(file);
    if (match) pageText.set(Number(match[1]), readFileSync(join(pageDir, file), 'utf8'));
    else if (!/^fm-\d{2}\.txt$/.test(file)) warn('pages', `unexpected file ${file} (want 012.txt or fm-01.txt)`);
  }
  for (const [page, text] of pageText) if (text.trim().length < 20) warn(`pages/${String(page).padStart(3, '0')}.txt`, 'almost empty: a figure page, or failed extraction?');
}

// copy check: 8-word runs of the page text
const words = (text) => text.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) ?? [];
const shingles = new Set();
for (const text of pageText.values()) {
  const list = words(text);
  for (let i = 0; i + COPY_RUN <= list.length; i++) shingles.add(list.slice(i, i + COPY_RUN).join(' '));
}
function copiedRun(text) {
  const list = words(text ?? '');
  for (let i = 0; i + COPY_RUN <= list.length; i++) {
    const run = list.slice(i, i + COPY_RUN).join(' ');
    if (shingles.has(run)) return run;
  }
  return null;
}

// entries
const entryDir = join(dir, 'entries');
const entries = new Map();
if (!existsSync(entryDir)) err('entries', 'missing entries/ folder');
else {
  for (const file of readdirSync(entryDir).filter((name) => name.endsWith('.json'))) {
    const entry = readJson(join(entryDir, file), `entries/${file}`);
    if (!entry) continue;
    if (`${entry.id}.json` !== file) err(`entries/${file}`, `file name must be ${entry.id}.json`);
    if (entries.has(entry.id)) err(`entries/${file}`, `duplicate id ${entry.id}`);
    entries.set(entry.id, entry);
  }
}
if (entries.size === 0) err('entries', 'no entries');

const known = (id) => entries.has(id) || id in TOOLS;
let unsure = 0;
const tally = { keep: 0, merge: 0, cut: 0, reuse: 0, proposed: new Map() };

for (const entry of entries.values()) {
  const at = entry.id;
  if (!isKey(at) || !at.startsWith(`${book.prefix}_`)) err(at, `id is lower snake case starting ${book.prefix}_`);
  if (at in TOOLS) err(at, 'id collides with an existing tool: use reuse instead');
  if (!sentence(entry.title)) err(at, 'needs a title');
  if (!sections.has(entry.section)) err(at, `section "${entry.section}" is not in book.json`);
  const pages = entry.pages;
  const pagesOk = Array.isArray(pages) && pages.length === 2 && pages.every(Number.isInteger) && pages[0] <= pages[1];
  if (!pagesOk) err(at, 'pages is [first, last] printed pages');
  else for (let page = pages[0]; page <= pages[1]; page++) if (!pageText.has(page)) err(at, `no pages/${String(page).padStart(3, '0')}.txt`);
  if (!VERDICTS.includes(entry.verdict)) err(at, `verdict is one of ${VERDICTS.join(', ')}`);
  else tally[entry.verdict]++;
  if (!sentence(entry.verdictWhy)) err(at, 'needs verdictWhy');
  if (entry.verdict === 'merge' && !entries.has(entry.mergeInto) && !(entry.mergeInto in TOOLS)) err(at, 'merge needs mergeInto naming an entry or tool');
  if (!TIERS.includes(entry.tier)) err(at, `tier is one of ${TIERS.join(', ')}`);
  if (entry.tier === 'essay' && entry.verdict === 'keep') warn(at, 'an essay kept as an entry: what will the person do with it?');

  if (entry.reuse) {
    tally.reuse++;
    if (!(entry.reuse.tool in TOOLS)) err(at, `reuse.tool "${entry.reuse.tool}" is not an existing tool (see --tools)`);
    if (!['exact', 'variant'].includes(entry.reuse.fit)) err(at, 'reuse.fit is exact or variant');
    if (entry.reuse.fit === 'variant' && !(entry.reuse.differences?.length > 0)) err(at, 'a variant lists its differences');
  }

  // Cut and merged entries need only their verdict; everything kept must be buildable.
  const kept = entry.verdict === 'keep';
  if (kept && !entry.reuse && entry.tier !== 'essay') {
    if (entry.family === 'proposed') {
      const proposal = entry.proposedFamily;
      if (!isKey(proposal?.name) || !sentence(proposal?.why) || !sentence(proposal?.shape)) err(at, 'proposedFamily needs name, why and shape');
      else tally.proposed.set(proposal.name, [...(tally.proposed.get(proposal.name) ?? []), at]);
    } else if (!FAMILIES.includes(entry.family)) {
      err(at, `family is one of ${[...FAMILIES, 'proposed'].join(', ')}`);
    } else if (FAMILY_FACTORIES[entry.family]) {
      try {
        FAMILY_FACTORIES[entry.family]({
          id: `dm_${at}`,
          name: entry.title,
          when: entry.when,
          tier: entry.tier,
          failureModes: entry.failureModes,
          steps: entry.steps,
          exercise: entry.exercise,
          chart: structuredClone(entry.structure ?? {})
        });
      } catch (error) {
        err(at, `structure does not build as a ${entry.family}: ${error.message.replace(/^Decision Book tool \S+: /, '')}`);
      }
    } else warn(at, `family ${entry.family} has no factory: Claude draws it by hand, so keep these rare`);
  }

  if (kept) {
    if (!sentence(entry.when)) err(at, 'needs when');
    if (!Array.isArray(entry.failureModes) || entry.failureModes.length < 2) err(at, 'needs at least two failureModes');
    if (!Array.isArray(entry.steps) || entry.steps.length === 0) err(at, 'needs steps');
    if (!sentence(entry.exercise)) warn(at, 'no exercise');
  }
  const stepIds = new Set();
  for (const step of entry.steps ?? []) {
    if (!isKey(step.id)) err(at, `step id "${step.id}" is lower snake case`);
    if (RESERVED_STEPS.includes(step.id)) err(at, `step id "${step.id}" is reserved`);
    if (stepIds.has(step.id)) err(at, `duplicate step id ${step.id}`);
    stepIds.add(step.id);
    if (!sentence(step.title) || !sentence(step.prompt)) err(at, `step ${step.id} needs title and prompt`);
  }

  // own words
  const coaching = [entry.when, entry.exercise, ...(entry.failureModes ?? []), ...(entry.steps ?? []).flatMap((step) => [step.title, step.prompt])];
  for (const text of coaching) {
    const run = copiedRun(text);
    if (run) err(at, `copied from the book: "${run}…" (rewrite in your own words)`);
  }

  // facts
  if (kept && entry.tier !== 'essay' && !(entry.facts?.length > 0)) err(at, 'a kept entry needs facts with page citations');
  for (const [index, fact] of (entry.facts ?? []).entries()) {
    const where = `${at} fact ${index + 1}`;
    if (!sentence(fact.claim) || !sentence(fact.anchor)) err(where, 'needs claim and anchor');
    if (pagesOk && !(fact.page >= pages[0] && fact.page <= pages[1])) err(where, `page ${fact.page} is outside ${pages[0]}–${pages[1]}`);
    if (fact.anchor && fact.anchor.split(/\s+/).length > 12) err(where, 'anchor is at most 12 words');
    const anchorPage = pageText.get(fact.page);
    if (anchorPage && fact.anchor && !words(anchorPage).join(' ').includes(words(fact.anchor).join(' '))) warn(where, 'anchor not found on its page');
    if (!CHECKS.includes(fact.check)) err(where, `check is one of ${CHECKS.join(', ')}`);
    if (fact.check === 'corrected' && !sentence(fact.note)) err(where, 'a correction says what changed');
    if (fact.check === 'unsure') {
      unsure++;
      if (!(entry.openQuestions?.length > 0)) err(where, 'an unsure fact needs an open question');
    }
  }

  // links
  const seeAlso = entry.seeAlso ?? [];
  for (const id of seeAlso) if (!known(id)) err(at, `seeAlso "${id}" is not an entry or tool`);
  for (const id of entry.pairsWell ?? []) {
    if (!known(id)) err(at, `pairsWell "${id}" is not an entry or tool`);
    if (seeAlso.includes(id)) err(at, `pairsWell repeats seeAlso "${id}"`);
    if (id === at) err(at, 'pairsWell names itself');
  }
}

// figures
const figures = readJson(join(dir, 'figures.json'), 'figures.json') ?? [];
for (const figure of figures) {
  const where = `figure ${figure.id}`;
  if (!ROLES.includes(figure.role)) err(where, `role is one of ${ROLES.join(', ')}`);
  if (!sentence(figure.means)) err(where, 'needs means');
  if (figure.entry && !entries.has(figure.entry)) err(where, `entry "${figure.entry}" does not exist`);
  if (figure.role === 'structure' && !figure.entry) err(where, 'a structure figure names its entry');
  if (!existsSync(join(dir, 'figures', `${figure.id}.png`))) warn(where, `no figures/${figure.id}.png`);
}

for (const file of ['overlap.md', 'process.md', 'questions.md']) if (!existsSync(join(dir, file))) err(file, 'missing');

// report
for (const line of warnings) console.log(`warn  ${line}`);
for (const line of errors) console.log(`ERROR ${line}`);
console.log('');
console.log(`${entries.size} entries: ${tally.keep} keep, ${tally.merge} merge, ${tally.cut} cut; ${tally.reuse} reuse an existing tool`);
for (const [name, ids] of tally.proposed) console.log(`proposed family ${name}: ${ids.join(', ')}`);
console.log(`${unsure} unsure facts, ${warnings.length} warnings, ${errors.length} errors`);
process.exit(errors.length ? 1 : 0);
