#!/usr/bin/env node
/**
 * Import Chadwick workout templates from the Shared 9 plain-text export
 * into life-hub-data/data/fitness/templates/*.md
 *
 * Usage:
 *   node scripts/import-workout-templates.mjs \
 *     --templates "/Users/.../Private & Shared 9/Workout Templates ....md" \
 *     --out "/Users/.../life-hub-data" \
 *     [--force]
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  renderTemplateMarkdown,
  templatePathForTitle
} from '../netlify/functions/_shared/workout-templates.mjs';

const args = parseArgs(process.argv.slice(2));
const templatesFile = resolve(args.templates || '');
const outRoot = resolve(args.out || '../life-hub-data');
const force = args.force === true;

if (!args.templates) {
  console.error('Provide --templates <Workout Templates.md> and --out <life-hub-data>');
  process.exit(1);
}

const text = readFileSync(templatesFile, 'utf8');
const sections = splitSections(text);
let written = 0;
const skipped = [];

for (const section of sections) {
  const template = parseTemplateSection(section);
  if (!template) {
    skipped.push(section.heading || '(empty)');
    continue;
  }
  const relative = templatePathForTitle(template.title);
  const full = join(outRoot, relative);
  mkdirSync(dirname(full), { recursive: true });
  if (existsSync(full) && !force) {
    skipped.push(`exists:${template.title}`);
    continue;
  }
  writeFileSync(full, renderTemplateMarkdown(template), 'utf8');
  written += 1;
}

console.log(JSON.stringify({
  outRoot,
  written,
  skipped: skipped.length,
  skippedSamples: skipped.slice(0, 10),
  titles: sections.map(s => s.heading).filter(Boolean)
}, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--templates') out.templates = argv[++i];
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--force') out.force = true;
  }
  return out;
}

function splitSections(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { heading: heading[1].trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push(current);
  return sections;
}

function parseTemplateSection(section) {
  const body = section.lines.join('\n');
  const titleMatch = /Workout name:\s*(.+)$/m.exec(body);
  const title = cleanTitle(titleMatch?.[1] || section.heading);
  if (!title || /^workout templates$/i.test(title)) return null;

  const focus = parseFocus(body);
  const sourceSessionDate = parseLastCompletionDate(body);
  const globalReps = inferGlobalReps(body);
  const exercises = parseExerciseList(body, globalReps);
  if (exercises.length === 0) return null;

  const duration = parseDurationHint(body);
  return {
    schema_version: 1,
    type: 'workout_template',
    title,
    session_kind: 'strength',
    day_type: duration != null && duration >= 40 ? 'workout_45_60' : 'workout_30',
    focus,
    ...(sourceSessionDate ? { source_session_date: sourceSessionDate } : {}),
    exercises
  };
}

function parseFocus(body) {
  const match = /Focus areas?:\s*(.+)$/im.exec(body)
    || /Muscle groups:[^.]*focus areas listed as\s+(.+)$/im.exec(body);
  if (!match) return [];
  return String(match[1])
    .split(/,| and /i)
    .map(part => part.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
}

function parseLastCompletionDate(body) {
  const dates = [];
  const re = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/gi;
  let match;
  while ((match = re.exec(body))) {
    dates.push(toIsoDate(match[1], match[2], match[3]));
  }
  return dates.length ? dates[dates.length - 1] : null;
}

function parseDurationHint(body) {
  const match = /(\d+)\s*min/i.exec(body);
  return match ? Number(match[1]) : null;
}

function parseExerciseList(body, globalReps = null) {
  const exercisesBlock = body.split(/###\s+Exercises/i)[1] || '';
  const lines = exercisesBlock.split(/\r?\n/);
  const exercises = [];
  for (const line of lines) {
    const item = /^\d+\.\s+(.+)$/.exec(line.trim());
    if (!item) continue;
    const parsed = parseExerciseLine(item[1], globalReps);
    if (parsed) exercises.push(parsed);
  }
  return exercises;
}

function parseExerciseLine(raw, globalReps = null) {
  let text = String(raw).trim().replace(/\.$/, '');
  const nameMatch = /^([^.(]+?)(?:\s+at\s+(\d+)\s+degrees?)?[.(]\s*(.*)$/i.exec(text)
    || /^(.+?)\.\s*(.*)$/.exec(text);
  if (!nameMatch) return null;

  let name = nameMatch[1].trim();
  let rest = (nameMatch[3] ?? nameMatch[2] ?? '').trim();
  let bench = null;
  const benchInName = /^(.+?)\s+at\s+(\d+)\s+degrees?$/i.exec(name);
  if (benchInName) {
    name = benchInName[1].trim();
    bench = Number(benchInName[2]);
  }
  if (nameMatch[2] && /^\d+$/.test(nameMatch[2]) && nameMatch[3] != null) {
    bench = Number(nameMatch[2]);
  }

  if (/^skipped\b/i.test(rest) && !/\d+\s*sets?/i.test(rest)) return null;

  const angle = /(?:at|@)\s+(\d+)\s+degrees?/i.exec(text);
  if (angle) bench = Number(angle[1]);

  const sets = expandSets(rest, name, globalReps);
  if (sets.length === 0) return null;

  return {
    name,
    ...(bench != null ? { bench_angle_deg: bench } : {}),
    ...(looksLikeAeke(name) ? { equipment: 'AEKE' } : {}),
    sets
  };
}

function expandSets(rest, name, globalReps = null) {
  const sets = [];
  const cableDefault = inferDefaultCable(rest, name);
  const repsDefault = inferGlobalReps(rest) || globalReps || null;

  // "2 sets x 8 reps at 30 kg" / "3 sets x 8 to 10 reps at 37 kg"
  const classic = /(\d+)\s*sets?\s*[x×]\s*(\d+)(?:\s*to\s*(\d+))?\s*(?:reps?|pulses?)(?:\s+at\s+([\d.]+)(?:\s*to\s*([\d.]+))?\s*kg)?/i.exec(rest);
  if (classic) {
    const count = Number(classic[1]);
    const reps = Number(classic[3] || classic[2]);
    const w1 = classic[4] != null ? Number(classic[4]) : 0;
    const w2 = classic[5] != null ? Number(classic[5]) : w1;
    for (let i = 0; i < count; i++) {
      const weight = count === 1 ? w1 : (i === count - 1 ? w2 : w1 + ((w2 - w1) * i) / Math.max(count - 1, 1));
      sets.push({
        reps,
        weight_kg: round1(weight),
        cable_type: mapCable(rest) || cableDefault
      });
    }
    return applyTrailingCable(sets, rest);
  }

  // "1 set x 30 sec" / "2 sets x 40 sec" / "45 sec each side"
  const timedSets = /(\d+)\s*sets?\s*[x×]\s*(\d+)\s*sec/i.exec(rest);
  if (timedSets) {
    const count = Number(timedSets[1]);
    const secs = Number(timedSets[2]);
    for (let i = 0; i < count; i++) {
      sets.push({ reps: secs, weight_kg: 0, cable_type: 'none' });
    }
    return sets;
  }
  const timedBare = /^(\d+)\s*sec(?:\s+each\s+side)?/i.exec(rest);
  if (timedBare) {
    sets.push({ reps: Number(timedBare[1]), weight_kg: 0, cable_type: 'none' });
    return sets;
  }

  // "2 rounds x 30 pulses"
  const rounds = /(\d+)\s*rounds?\s*[x×]\s*(\d+)\s*pulses?/i.exec(rest);
  if (rounds) {
    const count = Number(rounds[1]);
    const reps = Number(rounds[2]);
    for (let i = 0; i < count; i++) {
      sets.push({ reps, weight_kg: 0, cable_type: 'none' });
    }
    return sets;
  }

  // "Warm up x 10 then 3 sets x 8 reps at 40 kg"
  const warmThen = /warm\s*up(?:\s*[x×]\s*(\d+))?[\s\S]*?(\d+)\s*sets?\s*[x×]\s*(\d+)(?:\s*to\s*(\d+))?\s*reps?(?:\s+at\s+([\d.]+)\s*kg)?/i.exec(rest);
  if (warmThen) {
    const workWeight = warmThen[5] != null ? Number(warmThen[5]) : 0;
    if (warmThen[1]) {
      sets.push({
        reps: Number(warmThen[1]),
        weight_kg: workWeight,
        cable_type: cableDefault
      });
    }
    const count = Number(warmThen[2]);
    const reps = Number(warmThen[4] || warmThen[3]);
    for (let i = 0; i < count; i++) {
      sets.push({
        reps,
        weight_kg: workWeight,
        cable_type: mapCable(rest) || cableDefault
      });
    }
    return applyTrailingCable(sets, rest);
  }

  // "all 4 sets there" / "ran all 4 sets" at a stated kg
  const allSets = /(?:all|ran)\s+(\d+)\s*sets?.*?([\d.]+)\s*kg|([\d.]+)\s*kg.*?(?:all|ran)\s+(\d+)\s*sets?/i.exec(rest);
  if (allSets) {
    const count = Number(allSets[1] || allSets[4]);
    const weight = Number(allSets[2] || allSets[3]);
    for (let i = 0; i < count; i++) {
      sets.push({ reps: repsDefault || 8, weight_kg: weight, cable_type: cableDefault });
    }
    return sets;
  }

  // Weight ladder with explicit reps: "12 at 25 kg, then 12 at 34 kg"
  const ladder = [...rest.matchAll(/(\d+)\s+(?:reps?\s+)?at\s+([\d.]+)\s*kg/gi)];
  if (ladder.length >= 1) {
    for (const hit of ladder) {
      sets.push({
        reps: Number(hit[1]),
        weight_kg: Number(hit[2]),
        cable_type: mapCable(rest.slice(hit.index)) || mapCable(rest) || cableDefault
      });
    }
    return applyTrailingCable(sets, rest);
  }

  // "10 then 11 kg per side" / "15 then 14 kg" — before bare kg ladder
  const thenWeights = /([\d.]+)\s*then\s*([\d.]+)\s*kg/i.exec(rest);
  if (thenWeights) {
    sets.push({ reps: repsDefault || 12, weight_kg: Number(thenWeights[1]), cable_type: cableDefault });
    sets.push({
      reps: repsDefault || 12,
      weight_kg: Number(thenWeights[2]),
      cable_type: mapCable(rest) || cableDefault
    });
    return applyTrailingCable(sets, rest);
  }

  // "38 kg Constant Force, then 42 kg Concentric" (Chest and Curls style)
  const modeLadder = [...rest.matchAll(/([\d.]+)\s*kg(?:\s*(?:per\s+(?:side|hand|arm))?)?(?:\s*,?\s*(Constant\s*Force|Concentric|Eccentric|Elastic(?:\s*Mode)?|Rowing))?/gi)];
  if (modeLadder.length >= 1 && /[\d.]+\s*kg/i.test(rest) && !/\d+\s*sets?/i.test(rest)) {
    for (const hit of modeLadder) {
      sets.push({
        reps: repsDefault || 12,
        weight_kg: Number(hit[1]),
        cable_type: mapCable(hit[2] || '') || mapCable(rest.slice(hit.index, hit.index + hit[0].length + 20)) || cableDefault
      });
    }
    return sets;
  }

  // Fallback single set
  const anyReps = /(\d+)\s*reps?/i.exec(rest);
  const anyWeight = /([\d.]+)\s*kg/i.exec(rest);
  if (anyReps || anyWeight) {
    sets.push({
      reps: anyReps ? Number(anyReps[1]) : (repsDefault || 8),
      weight_kg: anyWeight ? Number(anyWeight[1]) : 0,
      cable_type: mapCable(rest) || cableDefault
    });
  } else if (/\d+\s*sets?/i.test(rest)) {
    const countMatch = /(\d+)\s*sets?/i.exec(rest);
    const count = Number(countMatch[1]);
    for (let i = 0; i < count; i++) {
      sets.push({ reps: repsDefault || 8, weight_kg: 0, cable_type: cableDefault });
    }
  }
  return sets;
}

function inferGlobalReps(rest) {
  const match = /every set was\s+(\d+)\s+reps/i.exec(rest);
  return match ? Number(match[1]) : null;
}

function applyTrailingCable(sets, rest) {
  if (!sets.length) return sets;
  const lower = rest.toLowerCase();
  if (/eccentric(?:\s*mode)?(?:\s+finisher)?(?:\s+on\s+(?:the\s+)?(?:final|last)\s+set)?/i.test(lower)) {
    sets[sets.length - 1] = { ...sets[sets.length - 1], cable_type: 'eccentric' };
  } else if (/elastic(?:\s*mode)?(?:\s+finisher)?/i.test(lower)) {
    sets[sets.length - 1] = { ...sets[sets.length - 1], cable_type: 'elastic' };
  }
  return sets;
}

function inferDefaultCable(rest, name) {
  if (/sec|pulse|stretch|yoga|pose|bird dog|crunch|twist|plank|cat pose|quick feet|bear knee/i.test(`${rest} ${name}`)) {
    return 'none';
  }
  return 'constant_force';
}

function mapCable(line) {
  const lower = String(line).toLowerCase();
  if (/constant\s*force/.test(lower)) return 'constant_force';
  if (/concentric/.test(lower)) return 'concentric';
  if (/eccentric/.test(lower)) return 'eccentric';
  if (/elastic/.test(lower)) return 'elastic';
  if (/rowing/.test(lower)) return 'rowing';
  return null;
}

function looksLikeAeke(name) {
  return /cable|bar |press|curl|fly|row|raise|lunge|squat|deadlift|thrust|tricep|bicep|ski pull|goblet/i.test(name);
}

function cleanTitle(title) {
  return String(title ?? '')
    .replace(/\s+[0-9a-f]{32}$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIsoDate(day, monthName, year) {
  const months = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };
  const month = months[String(monthName).toLowerCase()];
  if (!month) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
