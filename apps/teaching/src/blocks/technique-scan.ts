/**
 * Technique scan on rich text blocks.
 *
 * A teacher scans a block's text. The server returns which Periodic Table
 * techniques the passage uses, each with the quote, a confidence and a short
 * reason. The teacher ticks the ones to keep, and only those reach students:
 * the classroom tools' technique spinner picks from the approved list, never
 * from the raw scan and never from all 310 techniques.
 *
 * Saved on `block.settings.technique_scan` beside `word_help`. The stored HTML
 * is never touched.
 */
import type { LiteraryElementsTable, LiteraryTechnique } from '@/blocks/literary-elements';

/** Same floor as the widget's Passage Scanner. */
export const TECHNIQUE_CONFIDENCE_FLOOR = 20;

export type TechniqueHit = { id: string; confidence: number; explanation: string };
export type TechniqueFinding = { quote: string; techniques: TechniqueHit[] };

export type TechniqueScanData = {
  findings: TechniqueFinding[];
  scanned_at: string;
  /** Technique ids the teacher approved for students. Empty until reviewed. */
  approved_ids: string[];
  approved_at?: string;
};

export type ConfidenceTier = 'Likely' | 'Possible' | 'Worth considering';

export function confidenceTier(confidence: number): ConfidenceTier {
  return confidence >= 70 ? 'Likely' : confidence >= 40 ? 'Possible' : 'Worth considering';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function nameKey(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Look a technique up by table id or by name, ignoring case and punctuation. */
export function resolveTechnique(table: LiteraryElementsTable, nameOrId: string): LiteraryTechnique | undefined {
  const wanted = text(nameOrId);
  if (!wanted) return undefined;
  const byId = table.techniques.find((tech) => tech.id === wanted);
  if (byId) return byId;
  const key = nameKey(wanted);
  return table.techniques.find((tech) => nameKey(tech.name) === key);
}

/**
 * Findings from any untrusted list. Accepts the server's shape (technique
 * names) and the saved shape (technique ids). Names the table does not have
 * are dropped, as are hits under the confidence floor.
 */
export function normaliseTechniqueFindings(value: unknown, table: LiteraryElementsTable): TechniqueFinding[] {
  if (!Array.isArray(value)) return [];
  const out: TechniqueFinding[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const group = raw as Record<string, unknown>;
    const quote = text(group.quote);
    if (!quote || !Array.isArray(group.techniques)) continue;
    const seen = new Set<string>();
    const techniques: TechniqueHit[] = [];
    for (const rawHit of group.techniques) {
      if (!rawHit || typeof rawHit !== 'object') continue;
      const hit = rawHit as Record<string, unknown>;
      const tech = resolveTechnique(table, text(hit.id) || text(hit.technique));
      const confidence = Math.round(Number(hit.confidence));
      if (!tech || seen.has(tech.id) || !Number.isFinite(confidence) || confidence < TECHNIQUE_CONFIDENCE_FLOOR) continue;
      seen.add(tech.id);
      techniques.push({ id: tech.id, confidence: Math.min(100, confidence), explanation: text(hit.explanation) });
    }
    if (!techniques.length) continue;
    techniques.sort((a, b) => b.confidence - a.confidence);
    out.push({ quote, techniques });
  }
  return out;
}

/** Each technique the scan found once, strongest first. */
export function foundTechniqueIds(findings: TechniqueFinding[]): string[] {
  const best = new Map<string, number>();
  for (const finding of findings) {
    for (const hit of finding.techniques) {
      best.set(hit.id, Math.max(best.get(hit.id) ?? 0, hit.confidence));
    }
  }
  return [...best].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** A fresh scan. Nothing is approved until the teacher reviews it. */
export function createTechniqueScan(findings: TechniqueFinding[], now = new Date()): TechniqueScanData {
  return { findings, scanned_at: now.toISOString(), approved_ids: [] };
}

/** The teacher's saved scan on a block, if any. */
export function readTechniqueScan(
  block: { settings?: Record<string, unknown> },
  table: LiteraryElementsTable
): TechniqueScanData | null {
  const saved = block.settings?.technique_scan as Record<string, unknown> | undefined;
  if (!saved || typeof saved !== 'object') return null;
  const findings = normaliseTechniqueFindings(saved.findings, table);
  const found = new Set(foundTechniqueIds(findings));
  const approved = Array.isArray(saved.approved_ids)
    ? [...new Set(saved.approved_ids.filter((id): id is string => typeof id === 'string' && found.has(id)))]
    : [];
  const scan: TechniqueScanData = { findings, scanned_at: text(saved.scanned_at), approved_ids: approved };
  const approvedAt = text(saved.approved_at);
  if (approvedAt) scan.approved_at = approvedAt;
  return scan;
}

/** Record the teacher's ticks. Only techniques the scan found can be approved. */
export function approveTechniques(scan: TechniqueScanData, ids: string[], now = new Date()): TechniqueScanData {
  const found = foundTechniqueIds(scan.findings);
  const wanted = new Set(ids);
  return { ...scan, approved_ids: found.filter((id) => wanted.has(id)), approved_at: now.toISOString() };
}

/** What the technique spinner picks from: the approved list, in scan order. */
export function spinnerTechniques(
  block: { settings?: Record<string, unknown> },
  table: LiteraryElementsTable
): LiteraryTechnique[] {
  const scan = readTechniqueScan(block, table);
  if (!scan) return [];
  return scan.approved_ids
    .map((id) => table.techniques.find((tech) => tech.id === id))
    .filter((tech): tech is LiteraryTechnique => Boolean(tech));
}

/** Where each approved technique shows up in the text, for "find it" prompts. */
export function quotesForTechnique(scan: TechniqueScanData, id: string): string[] {
  return scan.findings.filter((finding) => finding.techniques.some((hit) => hit.id === id)).map((finding) => finding.quote);
}
