#!/usr/bin/env node
/**
 * Privacy guard: keeps personal content out of this public repository.
 *
 * Two layers:
 *   1. Generic rules that need no secrets: personal record folders, diary
 *      files, local home-directory paths, bank details and phone numbers.
 *   2. A private denylist of real names, clinicians, medications, schools and
 *      places. The list itself is personal, so it never lives here. It loads
 *      from PRIVACY_DENYLIST (newline or comma separated), PRIVACY_DENYLIST_FILE,
 *      or a sibling checkout at ../life-hub-data/config/privacy/denylist.txt.
 *
 * Findings name the file, line and rule, never the matched denylist term, so CI
 * logs on this public repo don't republish what the guard protects.
 *
 * Usage:
 *   node scripts/privacy-guard.mjs              scan tracked and untracked files
 *   node scripts/privacy-guard.mjs --text-env PR_TITLE,PR_BODY
 *                                               also scan those env values
 *   node scripts/privacy-guard.mjs --require-denylist
 *                                               fail when no denylist loads
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 2 * 1024 * 1024;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|ico|icns|mp[34]|mov|m4a|wav|ogg|ttf|otf|woff2?|pdf|zip|gz|glb|gltf|bin|wasm)$/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|\.git)\/|(^|\/)package-lock\.json$|\.lock$/;

/** Personal record folders and files that belong in the private data repository. */
export const PRIVATE_PATH_RULES = [
  { id: 'private-record-folder', re: /^data\/(mind|body|nutrition|fitness|calendar|skincare|travel|governance|hammond|home|property|os|professional|tasks|teaching|knowledge|aesthetics)\// },
  { id: 'private-migration-archive', re: /^private-migrations\// },
  { id: 'diary-file', re: /(^|\/)[^/]*diary[^/]*\.md$/i, allow: /^(tests|docs|apps\/[^/]+\/(tests|docs))\// }
];

/** Content patterns that are personal whoever they belong to. */
export const CONTENT_RULES = [
  { id: 'home-directory-path', re: /\/Users\/(?!example\b|you\b|me\b|name\b|username\b|user\b|<)[a-z][a-z0-9._-]{2,}\//gi },
  { id: 'bank-details', re: /\bBSB\b[^\n]{0,40}\b\d{3}[\s-]?\d{3}\b/gi },
  {
    id: 'au-mobile-number',
    re: /(?<![\d.])(?:\+?61\s?4|04)\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/g,
    // Placeholder numbers such as 0400 000 000 are fine in tests.
    ignore: value => /0{5,}/.test(value.replace(/\D/g, ''))
  }
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseDenylist(text) {
  return String(text ?? '')
    .split('\n')
    .flatMap(line => line.replace(/#.*$/, '').split(','))
    .map(term => term.trim())
    .filter(term => term.length >= 3);
}

export function loadDenylist({ env = process.env, root = ROOT } = {}) {
  if (typeof env.PRIVACY_DENYLIST === 'string' && env.PRIVACY_DENYLIST.trim()) {
    return { terms: parseDenylist(env.PRIVACY_DENYLIST), source: 'PRIVACY_DENYLIST' };
  }
  const candidates = [env.PRIVACY_DENYLIST_FILE, join(root, '..', 'life-hub-data', 'config', 'privacy', 'denylist.txt')];
  for (const file of candidates) {
    if (file && existsSync(file)) return { terms: parseDenylist(readFileSync(file, 'utf8')), source: 'file' };
  }
  return { terms: [], source: null };
}

/** One case-insensitive regex per term, matched on word edges. */
export function compileDenylist(terms) {
  return terms.map((term, index) => ({
    index: index + 1,
    re: new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term).replace(/\s+/g, '[\\s_-]+')}(?![A-Za-z0-9])`, 'i')
  }));
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** Scan one text. Returns findings with no matched denylist text in them. */
export function scanText(text, label, denylist) {
  const findings = [];
  for (const rule of CONTENT_RULES) {
    for (const match of text.matchAll(rule.re)) {
      if (rule.ignore?.(match[0])) continue;
      findings.push({ where: `${label}:${lineOf(text, match.index)}`, rule: rule.id });
    }
  }
  const lines = text.split('\n');
  for (const { index, re } of denylist) {
    lines.forEach((line, i) => {
      if (re.test(line)) findings.push({ where: `${label}:${i + 1}`, rule: `denylist term #${index}` });
    });
  }
  return findings;
}

export function scanPath(path, denylist) {
  const findings = [];
  for (const rule of PRIVATE_PATH_RULES) {
    if (rule.re.test(path) && !rule.allow?.test(path)) findings.push({ where: path, rule: rule.id });
  }
  for (const { index, re } of denylist) {
    if (re.test(path)) findings.push({ where: path, rule: `denylist term #${index} in file name` });
  }
  return findings;
}

function listFiles(root) {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);
  return [...new Set(result.stdout.split('\0').filter(Boolean))];
}

export function scanRepository({ root = ROOT, denylist = [] } = {}) {
  const findings = [];
  for (const path of listFiles(root)) {
    if (SKIP_PATH.test(path)) continue;
    findings.push(...scanPath(path, denylist));
    if (BINARY_EXT.test(path)) continue;
    const abs = join(root, path);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue; // deleted in the working tree
    }
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    const buffer = readFileSync(abs);
    if (buffer.subarray(0, 8000).includes(0)) continue;
    findings.push(...scanText(buffer.toString('utf8'), path, denylist));
  }
  return findings;
}

function main(argv) {
  const args = argv.slice(2);
  const textEnvIndex = args.indexOf('--text-env');
  const textEnv = textEnvIndex >= 0 ? String(args[textEnvIndex + 1] ?? '').split(',').filter(Boolean) : [];
  const { terms, source } = loadDenylist();
  const denylist = compileDenylist(terms);

  if (!terms.length) {
    const message = 'privacy guard: no private denylist loaded (set the PRIVACY_DENYLIST secret, or check out life-hub-data beside this repo). Only generic rules ran.';
    if (args.includes('--require-denylist')) {
      console.error(`FAIL  ${message}`);
      return 1;
    }
    console.warn(`WARN  ${message}`);
  } else {
    console.log(`privacy guard: ${terms.length} private denylist terms loaded from ${source}`);
  }

  const findings = scanRepository({ denylist });
  for (const name of textEnv) {
    if (typeof process.env[name] === 'string') findings.push(...scanText(process.env[name], name, denylist));
  }

  if (findings.length) {
    for (const finding of findings) console.error(`FAIL  ${finding.where}  ${finding.rule}`);
    console.error(`\nprivacy guard: ${findings.length} finding(s). Personal content belongs in the private life-hub-data repository; public code, tests, docs and PR text use invented people and synthetic records.`);
    return 1;
  }
  console.log('PASS  privacy guard (no personal content found)');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}
