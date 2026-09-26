#!/usr/bin/env node
/**
 * Medical Overview v2 one-off backfill (MO-11).
 * Dry-run by default (prints diff). Pass --write to apply.
 *
 * Usage:
 *   node scripts/medical-v2-backfill.mjs
 *   node scripts/medical-v2-backfill.mjs --write
 *   node scripts/medical-v2-backfill.mjs --root /path/to/life-hub-data
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, dump } from 'js-yaml';
import { inferWeight, normalizeMedicalFields } from '../apps/life/js/app/medical-normalize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WRITE = process.argv.includes('--write');
const rootFlag = process.argv.indexOf('--root');
const DATA_ROOT = rootFlag >= 0
  ? path.resolve(process.argv[rootFlag + 1])
  : path.resolve(__dirname, '../../life-hub-data');

const HEAD_COLD = {
  id: 'ep-head-cold',
  title: 'Head cold',
  status: 'active',
  started: '2026-09-23'
};

const PLANNED = [
  {
    date: '2026-09-26',
    title: 'MRCP — liver / bile ducts',
    status: 'to_book',
    date_precision: 'tbd',
    weight: 'major',
    notes: 'Ordered 24 Sep gastro review — exclude PSC'
  },
  {
    date: '2026-12-01',
    title: 'Repeat bloods before travel',
    status: 'planned',
    date_precision: 'month',
    weight: 'routine',
    notes: 'Early Dec — from 24 Sep gastro note'
  },
  {
    date: '2027-02-01',
    title: 'Colonoscopy',
    status: 'planned',
    date_precision: 'month',
    weight: 'major',
    notes: 'From 24 Sep gastro note'
  },
  {
    date: '2027-03-01',
    title: 'Gastro review — Dr Chris Keily',
    status: 'planned',
    date_precision: 'month',
    weight: 'major',
    notes: 'From 24 Sep gastro note'
  }
];

async function walkMedical(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkMedical(full, out);
    else if (/-medical-.*\.md$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function parseMedicalFile(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/.exec(text.trim());
  if (!match) return null;
  const record = load(match[1]);
  if (!record || record.type !== 'medical') return null;
  return { record, body: match[2].trim() };
}

function serializeMedical(record, body) {
  const front = dump(record, { lineWidth: 100, noRefs: true }).trimEnd();
  return `---\n${front}\n---\n${body ? `${body}\n` : ''}`;
}

function slugify(title) {
  return String(title || 'visit')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'visit';
}

async function main() {
  const bodyRoot = path.join(DATA_ROOT, 'data', 'body');
  const files = await walkMedical(bodyRoot);
  const diffs = [];
  const records = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const parsed = parseMedicalFile(text);
    if (!parsed) continue;
    records.push({ file, ...parsed });
  }

  console.log(`Medical v2 backfill — ${WRITE ? 'WRITE' : 'DRY-RUN'} — root ${DATA_ROOT}`);
  console.log(`Found ${records.length} medical files\n`);

  // 1) Assign weight to all records
  for (const item of records) {
    const before = item.record.weight;
    const weight = before || inferWeight({ ...item.record, notes: item.body });
    if (before !== weight) {
      diffs.push(`WEIGHT ${path.relative(DATA_ROOT, item.file)}: ${before || '(none)'} → ${weight}`);
      item.record.weight = weight;
      item.dirty = true;
    }
  }

  // 2) Head-cold symptoms (23/09 Feeling run down, 24/09 Sore throat…)
  for (const item of records) {
    const title = String(item.record.title || '');
    const date = item.record.date;
    const isRunDown = date === '2026-09-23' && /run down|feeling run down/i.test(title + item.body);
    const isSore = date === '2026-09-24' && /sore throat|sniffles/i.test(title);
    if (!isRunDown && !isSore) continue;
    item.record.record_type = 'Symptom';
    item.record.lane = 'symptom';
    item.record.weight = 'minor';
    item.record.episode = { ...HEAD_COLD };
    item.dirty = true;
    diffs.push(`SYMPTOM+EPISODE ${date} "${title}" → Head cold`);
  }

  // 3) Split 26/09 text out of 24/09 notes if present
  const sore24 = records.find(r =>
    r.record.date === '2026-09-24' && /sore throat|sniffles/i.test(String(r.record.title || ''))
  );
  if (sore24) {
    const body = sore24.body || '';
    const dated = body.match(/(?:^|\n)(?:26\s*Sep(?:tember)?|2026-09-26|26\/09)[:\s—-]+([\s\S]+?)(?=\n(?:\d{1,2}\s*Sep|2026-|$))/i);
    const congested = body.match(/still congested[^\n]*/i);
    let extract = dated?.[1]?.trim() || congested?.[0]?.trim() || null;
    if (extract) {
      const existing26 = records.find(r =>
        r.record.date === '2026-09-26'
        && r.record.episode?.id === HEAD_COLD.id
      );
      if (!existing26) {
        const newRecord = {
          schema_version: 1,
          id: `med-20260926-still-congested`,
          type: 'medical',
          date: '2026-09-26',
          time: '09:00',
          created_at: '2026-09-26T09:00:00+10:00',
          updated_at: '2026-09-26T09:00:00+10:00',
          source: 'backfill',
          title: 'Still congested, throat better',
          record_type: 'Symptom',
          lane: 'symptom',
          weight: 'minor',
          location_kind: 'unknown',
          episode: { ...HEAD_COLD }
        };
        const relDir = path.join('data', 'body', '2026', '09');
        const fileName = `2026-09-26-medical-${slugify(newRecord.title)}-0900.md`;
        const dest = path.join(DATA_ROOT, relDir, fileName);
        diffs.push(`CREATE ${path.relative(DATA_ROOT, dest)}\n  notes: ${extract.slice(0, 120)}`);
        sore24._split26 = { dest, record: newRecord, body: extract };
        // Strip from 24/09 body when writing
        sore24.body = body.replace(extract, '').replace(/\n{3,}/g, '\n\n').trim();
        sore24.dirty = true;
        diffs.push(`STRIP 26/09 text from ${path.relative(DATA_ROOT, sore24.file)}`);
      }
    } else {
      diffs.push('SPLIT 26/09: no dated paragraph found in 24/09 notes — print for Adam:');
      diffs.push(`--- 24/09 body ---\n${body}\n---`);
    }
  }

  // 4) Planned records from 24/09 gastro note
  for (const planned of PLANNED) {
    const exists = records.some(r =>
      r.record.date === planned.date
      && String(r.record.title || '').toLowerCase().includes(planned.title.toLowerCase().slice(0, 12))
    );
    if (exists) {
      diffs.push(`PLANNED skip (exists): ${planned.title}`);
      continue;
    }
    const fields = normalizeMedicalFields(planned, { notes: planned.notes, today: '2026-09-26' });
    const record = {
      schema_version: 1,
      id: `med-${planned.date.replace(/-/g, '')}-${slugify(planned.title)}`,
      type: 'medical',
      date: planned.date,
      time: '09:00',
      created_at: `${planned.date}T09:00:00+10:00`,
      updated_at: `${planned.date}T09:00:00+10:00`,
      source: 'backfill',
      ...fields
    };
    const [y, m] = planned.date.split('-');
    const dest = path.join(
      DATA_ROOT, 'data', 'body', y, m,
      `${planned.date}-medical-${slugify(planned.title)}-0900.md`
    );
    diffs.push(`CREATE planned ${path.relative(DATA_ROOT, dest)} [${planned.status}/${planned.date_precision}]`);
    records.push({ file: dest, record, body: planned.notes, dirty: true, _create: true });
  }

  // 5) cadence_days: 56 on Stelara doses
  for (const item of records) {
    const blob = `${item.record.title || ''} ${item.body || ''}`;
    if (!/stelara|ustekinumab/i.test(blob)) continue;
    if (item.record.cadence_days === 56) continue;
    item.record.cadence_days = 56;
    item.record.weight = item.record.weight || 'major';
    item.dirty = true;
    diffs.push(`CADENCE ${item.record.date} "${item.record.title}" → 56`);
  }

  // 6) Duplicate 24/09 gastro cards — print both for Adam
  const gastroDupes = records.filter(r =>
    r.record.date === '2026-09-24'
    && /gastro/i.test(String(r.record.title || ''))
  );
  if (gastroDupes.length >= 2) {
    diffs.push('DUPLICATE gastro cards on 24/09 (Adam to confirm merge):');
    for (const d of gastroDupes) {
      diffs.push(`  - ${path.relative(DATA_ROOT, d.file)} :: "${d.record.title}"`);
    }
    // Prefer the biologics & liver title; soft-merge notes into first and mark second
    const preferred = gastroDupes.find(d => /biologics|liver review/i.test(d.record.title))
      || gastroDupes[0];
    const other = gastroDupes.find(d => d !== preferred);
    if (preferred && other) {
      diffs.push(`  would keep: "${preferred.record.title}"`);
      diffs.push(`  would drop: "${other.record.title}" (notes appended)`);
      preferred.body = [preferred.body, other.body].filter(Boolean).join('\n\n');
      preferred.dirty = true;
      other._delete = true;
      other.dirty = true;
    }
  }

  console.log(diffs.join('\n') || '(no changes)');
  console.log(`\n${diffs.length} diff lines`);

  if (!WRITE) {
    console.log('\nDry-run only. Re-run with --write to apply.');
    return;
  }

  for (const item of records) {
    if (item._split26) {
      await mkdir(path.dirname(item._split26.dest), { recursive: true });
      await writeFile(
        item._split26.dest,
        serializeMedical(item._split26.record, item._split26.body),
        'utf8'
      );
      console.log('wrote', path.relative(DATA_ROOT, item._split26.dest));
    }
    if (item._delete) {
      // Leave file but mark — safer than unlink without Adam OK
      diffs.push(`DELETE skipped (manual): ${item.file}`);
      continue;
    }
    if (!item.dirty) continue;
    await mkdir(path.dirname(item.file), { recursive: true });
    await writeFile(item.file, serializeMedical(item.record, item.body), 'utf8');
    console.log('wrote', path.relative(DATA_ROOT, item.file));
  }
  console.log('Write complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
