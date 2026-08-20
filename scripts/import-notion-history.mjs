#!/usr/bin/env node
/**
 * Import Notion workout session pages + body measurement CSV into life-hub-data.
 *
 * Usage:
 *   node scripts/import-notion-history.mjs \
 *     --workouts "/Users/.../Private & Shared 2/Untitled" \
 *     --body-csv "/Users/.../Private & Shared 3/..._all.csv" \
 *     --body-history-csv "/Users/.../body-history.csv" \
 *     --bloods-csv "/Users/.../blood-test-tracker.csv" \
 *     --medical-csv "/Users/.../medical-records.csv" \
 *     --body-dir "/Users/.../Private & Shared 4/.../Body Measurements" \
 *     --body-log "/Users/.../Body Data Record ....md" \
 *     --out "/Users/.../life-hub-data"
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sydneyLocalStamp } from '../js/core/time.js';
import { parseBodyLogMarkdown } from './lib/body-log-import.mjs';
import { parseBodyHistoryCsv } from './lib/body-history-csv-import.mjs';
import { parseBloodsCsv } from './lib/bloods-csv-import.mjs';
import { parseMedicalCsv } from './lib/medical-csv-import.mjs';

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
let args = {};

if (isMain) {
args = parseArgs(process.argv.slice(2));
const outRoot = resolve(args.out || '../life-hub-data');
const workoutsDir = args.workouts ? resolve(args.workouts) : null;
const bodyCsv = args.bodyCsv ? resolve(args.bodyCsv) : null;
const bodyHistoryCsv = args.bodyHistoryCsv ? resolve(args.bodyHistoryCsv) : null;
const bodyDir = args.bodyDir ? resolve(args.bodyDir) : null;
const bodyLog = args.bodyLog ? resolve(args.bodyLog) : null;
const bloodsCsv = args.bloodsCsv ? resolve(args.bloodsCsv) : null;
const medicalCsv = args.medicalCsv ? resolve(args.medicalCsv) : null;

if (!workoutsDir && !bodyCsv && !bodyHistoryCsv && !bodyDir && !bodyLog && !bloodsCsv && !medicalCsv) {
  console.error('Provide --workouts <dir> and/or --body-csv <file> and/or --body-history-csv <file> and/or --body-dir <dir> and/or --body-log <file> and/or --bloods-csv <file> and/or --medical-csv <file> and --out <life-hub-data>');
  process.exit(1);
}

let workoutCount = 0;
let bodyCount = 0;
const skipped = [];

if (workoutsDir) {
  const files = readdirSync(workoutsDir).filter(name => name.endsWith('.md'));
  for (const file of files) {
    if (/^Template\b/i.test(file)) {
      skipped.push(`template-page:${file}`);
      continue;
    }
    const text = readFileSync(join(workoutsDir, file), 'utf8');
    const parsed = parseWorkoutMarkdown(text, file);
    if (!parsed) {
      skipped.push(`workout:${file}`);
      continue;
    }
    const path = eventPath('fitness', parsed.record.date, parsed.slug);
    writeEvent(outRoot, path, parsed.record, parsed.notes);
    workoutCount += 1;
  }
}

if (bodyCsv) {
  const rows = parseCsv(readFileSync(bodyCsv, 'utf8'));
  for (const row of rows) {
    const events = bodyEventsFromRow(row);
    for (const event of events) {
      const path = eventPath('body', event.record.date, event.slug);
      writeEvent(outRoot, path, event.record, event.notes);
      bodyCount += 1;
    }
  }
}

if (bodyHistoryCsv) {
  const events = parseBodyHistoryCsv(readFileSync(bodyHistoryCsv, 'utf8'));
  for (const event of events) {
    const path = eventPath('body', event.record.date, event.slug);
    writeEvent(outRoot, path, event.record, event.notes);
    bodyCount += 1;
  }
}

if (bodyDir) {
  const files = readdirSync(bodyDir).filter(name => name.endsWith('.md'));
  for (const file of files) {
    const text = readFileSync(join(bodyDir, file), 'utf8');
    const events = bodyEventsFromMarkdown(text);
    if (events.length === 0) {
      skipped.push(`body:${file}`);
      continue;
    }
    for (const event of events) {
      const path = eventPath('body', event.record.date, event.slug);
      writeEvent(outRoot, path, event.record, event.notes);
      bodyCount += 1;
    }
  }
}
if (bodyLog) {
  const text = readFileSync(bodyLog, 'utf8');
  const events = parseBodyLogMarkdown(text);
  for (const event of events) {
    const path = eventPath('body', event.record.date, event.slug);
    writeEvent(outRoot, path, event.record, event.notes);
    bodyCount += 1;
  }
}

if (bloodsCsv) {
  const events = parseBloodsCsv(readFileSync(bloodsCsv, 'utf8'));
  for (const event of events) {
    const path = eventPath('body', event.record.date, event.slug);
    writeEvent(outRoot, path, event.record, event.notes);
    bodyCount += 1;
  }
}

if (medicalCsv) {
  const events = parseMedicalCsv(readFileSync(medicalCsv, 'utf8'));
  for (const event of events) {
    const path = eventPath('body', event.record.date, event.slug);
    writeEvent(outRoot, path, event.record, event.notes);
    bodyCount += 1;
  }
}

console.log(JSON.stringify({
  outRoot,
  bodyLog,
  bloodsCsv,
  medicalCsv,
  workoutCount,
  bodyCount,
  skipped: skipped.length,
  skippedSamples: skipped.slice(0, 10)
}, null, 2));
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--workouts') out.workouts = argv[++i];
    else if (arg === '--body-csv') out.bodyCsv = argv[++i];
    else if (arg === '--body-history-csv') out.bodyHistoryCsv = argv[++i];
    else if (arg === '--body-dir') out.bodyDir = argv[++i];
    else if (arg === '--body-log') out.bodyLog = argv[++i];
    else if (arg === '--bloods-csv') out.bloodsCsv = argv[++i];
    else if (arg === '--medical-csv') out.medicalCsv = argv[++i];
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--force') out.force = true;
  }
  return out;
}

function writeEvent(root, relativePath, record, notes) {
  const full = join(root, relativePath);
  mkdirSync(join(full, '..'), { recursive: true });
  let existing = null;
  if (existsSync(full)) {
    if (!args.force) return;
    try {
      existing = readFileSync(full, 'utf8');
      if (/^source:\s*"?chat"?/m.test(existing) || /^source:\s*chat\s*$/m.test(existing)) return;
    } catch {
      // rewrite if unreadable
    }
  }
  const yaml = renderFrontmatter(record);
  writeFileSync(full, `---\n${yaml}---\n${eventBody(existing, notes)}`, 'utf8');
}

// A source without a notes column must not erase prose a previous import wrote:
// lab numbers, referring doctor, and per-result commentary only live in the body.
export function eventBody(existingText, notes) {
  if (typeof notes === 'string' && notes.trim()) return `${notes.trim()}\n`;
  const body = String(existingText ?? '').replace(/^---\n[\s\S]*?\n---\n?/, '');
  return body.trim() ? body : '';
}

function eventPath(domain, dateKey, slug) {
  const [year, month] = dateKey.split('-');
  return `data/${domain}/${year}/${month}/${dateKey}-${slug}.md`;
}

function renderFrontmatter(record) {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n') + '\n';
}

function parseWorkoutMarkdown(text, fileName) {
  const props = extractProps(text);
  const title = firstHeading(text) || props.Workout || basename(fileName, '.md');
  const dateKey = parseNotionDate(props['Workout date'] || props.Date);
  if (!dateKey) return null;

  const duration = num(props['Estimated duration minutes']);
  const distance = num(props['Distance km']);
  const sessionKind = inferSessionKind(title, props);
  const dayType = inferDayType(sessionKind, duration);
  const status = /completed|yes/i.test(String(props.Status || props['Workout done'] || 'completed'))
    ? 'completed'
    : 'skipped';

  const globalReps = parseGlobalReps(text);
  const exercises = parseExercises(text, globalReps);
  if (sessionKind === 'strength' && status === 'completed' && exercises.length === 0) {
    // Strength page without set detail — still import as shell with notes.
  }

  const focus = String(props['Focus areas'] || '')
    .split(/[,/]/)
    .map(part => part.trim().toLowerCase())
    .filter(Boolean);

  const time = '07:00';
  const stamp = sydneyLocalStamp(dateKey, time);
  const record = {
    schema_version: 1,
    id: `notion-${dateKey}-${slugify(title).slice(0, 40)}`,
    type: 'workout',
    date: dateKey,
    time,
    created_at: stamp,
    updated_at: stamp,
    source: 'notion_import',
    title: cleanTitle(title),
    session_kind: sessionKind,
    day_type: dayType,
    status,
    ...(duration != null ? { duration_min: duration } : {}),
    ...(distance != null ? { distance_km: distance } : {}),
    ...(focus.length ? { focus } : {}),
    recovery_flag_next_day: false,
    exercises,
    pain_flags: []
  };

  const notes = [
    props['Completion notes'],
    props['Decision log'] ? `Decision log: ${props['Decision log']}` : null
  ].filter(Boolean).join('\n\n');

  return { record, notes, slug: slugify(title) };
}

function extractProps(text) {
  const props = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = /^([A-Za-z][A-Za-z0-9 /%-]*):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    if (match[1].startsWith('#')) continue;
    props[match[1]] = match[2];
    if (Object.keys(props).length > 20) break;
  }
  return props;
}

function firstHeading(text) {
  const match = /^#\s+(.+)$/m.exec(text);
  return match ? match[1].trim() : null;
}

function parseGlobalReps(text) {
  const match = /Every set was\s+(\d+)\s+reps/i.exec(text);
  return match ? Number(match[1]) : null;
}

function parseExercises(text, globalReps) {
  const exercises = [];
  const block = text.split(/## What you actually did/i)[1] || text;
  const chunks = block.split(/\n(?=\d+\.\s+\*\*)/);
  for (const chunk of chunks) {
    const header = /^\d+\.\s+\*\*(.+?)\*\*(?:\s+at\s+(\d+)\s+degrees?)?/i.exec(chunk);
    if (!header) continue;
    const name = header[1].trim();
    const bench = header[2] != null ? Number(header[2]) : null;
    const sets = [];
    const setRe = /Set\s+(\d+)\s*:\s*([^\n]+)/gi;
    let setMatch;
    while ((setMatch = setRe.exec(chunk))) {
      const parsed = parseSetLine(setMatch[2], globalReps);
      if (parsed) sets.push(parsed);
    }
    if (sets.length === 0 && globalReps != null) continue;
    exercises.push({
      name,
      ...(bench != null ? { bench_angle_deg: bench } : {}),
      ...(looksLikeAeke(name) ? { equipment: 'AEKE' } : {}),
      sets
    });
  }
  return exercises;
}

function parseSetLine(line, globalReps) {
  const weightMatch = /(\d+(?:\.\d+)?)\s*kg/i.exec(line);
  const repsMatch = /(\d+)\s*reps?/i.exec(line);
  const cable = mapCable(line);
  const weight_kg = weightMatch ? Number(weightMatch[1]) : 0;
  const reps = repsMatch ? Number(repsMatch[1]) : (globalReps ?? 0);
  if (!weightMatch && reps === 0 && !cable) return null;
  return {
    reps,
    weight_kg,
    cable_type: cable || (weightMatch ? 'constant_force' : 'none')
  };
}

function mapCable(line) {
  const lower = line.toLowerCase();
  if (/constant\s*force/.test(lower)) return 'constant_force';
  if (/concentric/.test(lower)) return 'concentric';
  if (/eccentric/.test(lower)) return 'eccentric';
  if (/elastic/.test(lower)) return 'elastic';
  if (/rowing/.test(lower)) return 'rowing';
  if (/\bnone\b/.test(lower)) return 'none';
  return null;
}

function looksLikeAeke(name) {
  return /cable|bar |press|curl|fly|row|raise|lunge|squat|deadlift|pushdown|pulldown|kickback/i.test(name);
}

function inferSessionKind(title, props) {
  const blob = `${title} ${props['Focus areas'] || ''} ${props['Session type'] || ''}`.toLowerCase();
  if (/\bwalk\b|cardio king|strut/.test(blob)) return 'walk';
  if (/\bep\b|veronica|exercise physiolog/.test(blob)) return 'ep';
  if (/yoga|mobility|deload foundations|flow/.test(blob)) return 'mobility';
  return 'strength';
}

function inferDayType(kind, duration) {
  if (kind === 'walk' || kind === 'mobility') return 'movement';
  if (duration != null && duration >= 40) return 'workout_45_60';
  if (kind === 'ep') return 'workout_30';
  return 'workout_30';
}

function cleanTitle(title) {
  return title.replace(/\s+[0-9a-f]{32}$/i, '').replace(/\s+/g, ' ').trim();
}

function slugify(title) {
  return cleanTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'session';
}

function parseNotionDate(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmy) {
    return `${dmy[3]}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
  }
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  const match = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(trimmed);
  if (!match) return null;
  const month = months[match[2].toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${String(month).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
}

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function bodyEventsFromMarkdown(text) {
  const props = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z][^:]{0,60}):\s*(.*)$/.exec(line.trim());
    if (match) props[match[1]] = match[2];
  }
  // Reuse CSV mapper with Notion property names.
  return bodyEventsFromRow({
    Snapshot: firstHeading(text) || '',
    Date: props.Date || '',
    Notes: props.Notes || '',
    'Weight (kg)': props['Weight (kg)'] || '',
    'Body Fat %': props['Body Fat %'] || '',
    'Skeletal Muscle (kg)': props['Skeletal Muscle (kg)'] || props['Total Muscle Mass (kg)'] || '',
    'Total Muscle Mass (kg)': props['Total Muscle Mass (kg)'] || '',
    'Visceral Fat': props['Visceral Fat'] || '',
    'Body Age': props['Body Age'] || '',
    'Chest (cm)': props['Chest (cm)'] || '',
    'Waist (cm)': props['Waist (cm)'] || '',
    'Hips (cm)': props['Hips (cm)'] || '',
    'Right Arm Flexed (cm)': props['Right Arm Flexed (cm)'] || '',
    'Right Arm Relaxed (cm)': props['Right Arm Relaxed (cm)'] || '',
    'Left Arm Flexed (cm)': props['Left Arm Flexed (cm)'] || '',
    'Left Arm Relaxed (cm)': props['Left Arm Relaxed (cm)'] || '',
    'Right Thigh (cm)': props['Right Thigh (cm)'] || '',
    'Left Thigh (cm)': props['Left Thigh (cm)'] || '',
    'Right Calf (cm)': props['Right Calf (cm)'] || '',
    'Left Calf (cm)': props['Left Calf (cm)'] || '',
    'Neck (cm)': props['Neck (cm)'] || '',
    'Shoulders (cm)': props['Shoulders (cm)'] || ''
  });
}

export function bodyEventsFromRow(row) {
  const dateKey = parseNotionDate(row.Snapshot) || parseNotionDate(row.Date);
  if (!dateKey) return [];
  const events = [];
  const notes = row.Notes || '';
  const weight = num(row['Weight (kg)']);
  const bodyFat = num(row['Body Fat %']);
  const muscle = num(row['Skeletal Muscle (kg)'] || row['Total Muscle Mass (kg)']);
  const visceral = num(row['Visceral Fat']);
  const bodyAge = num(row['Body Age']);

  const bodyTime = '12:00';
  const bodyStamp = sydneyLocalStamp(dateKey, bodyTime);

  if (weight != null && (bodyFat != null || muscle != null || visceral != null)) {
    events.push({
      slug: 'composition',
      notes,
      record: {
        schema_version: 1,
        id: `notion-composition-${dateKey}`,
        type: 'composition',
        date: dateKey,
        time: bodyTime,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        weight_kg: weight,
        ...(bodyFat != null ? { body_fat_pct: bodyFat } : {}),
        ...(muscle != null ? { skeletal_muscle_kg: muscle } : {}),
        ...(visceral != null ? { visceral_fat_level: visceral } : {}),
        ...(bodyAge != null ? { body_age: bodyAge } : {})
      }
    });
  } else if (weight != null) {
    events.push({
      slug: 'weight',
      notes,
      record: {
        schema_version: 1,
        id: `notion-weight-${dateKey}`,
        type: 'weight',
        date: dateKey,
        time: bodyTime,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        weight_kg: weight
      }
    });
  }

  const rightCalf = num(row['Right Calf (cm)']);
  const leftCalf = num(row['Left Calf (cm)']);
  const measurements = {
    chest: num(row['Chest (cm)']),
    waist: num(row['Waist (cm)']),
    hips: num(row['Hips (cm)']),
    shoulders: num(row['Shoulders (cm)']),
    neck: num(row['Neck (cm)']),
    right_arm_flexed: num(row['Right Arm Flexed (cm)']),
    left_arm_flexed: num(row['Left Arm Flexed (cm)']),
    right_arm_relaxed: num(row['Right Arm Relaxed (cm)']),
    left_arm_relaxed: num(row['Left Arm Relaxed (cm)']),
    right_thigh: num(row['Right Thigh (cm)']),
    left_thigh: num(row['Left Thigh (cm)']),
    calves: rightCalf != null && leftCalf != null
      ? (rightCalf + leftCalf) / 2
      : (rightCalf ?? leftCalf)
  };
  if (Object.values(measurements).some(value => value != null)) {
    events.push({
      slug: 'measurements',
      notes,
      record: {
        schema_version: 1,
        id: `notion-measurements-${dateKey}`,
        type: 'measurements',
        date: dateKey,
        time: bodyTime,
        created_at: bodyStamp,
        updated_at: bodyStamp,
        source: 'notion_import',
        ...Object.fromEntries(Object.entries(measurements).filter(([, value]) => value != null))
      }
    });
  }
  return events;
}

function parseCsv(text) {
  const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else current += ch;
  }
  cells.push(current);
  return cells;
}
