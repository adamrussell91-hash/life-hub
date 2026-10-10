import type { JournalDocument } from '@/api/journal';
import {
  buildPhotoAnnotationsExportJson,
  formatMediaAnnotationsPlainText,
  getMediaPhotoAnnotations,
} from '@/journal/annotations';
import {
  formatAuthorshipExportLabel,
  resolveMomentAuthor,
} from '@/journal/corey-perspective';
import type { JournalLeg, JournalLifecycle, JournalMedia, JournalMoment } from '@/journal/types';
import { buildPhotoStops, buildSegments } from '@/journal/map-connections';
import exportReaderHtml from '@/journal/export-reader/index.html?raw';
import kulPatternSvg from '@/journal/patterns/kul.svg?raw';
import istPatternSvg from '@/journal/patterns/ist.svg?raw';

export const JOURNAL_EXPORT_BUNDLE_VERSION = 1;

const PATTERN_ASSETS: Record<string, { filename: string; svg: string }> = {
  kul: { filename: 'kul.svg', svg: kulPatternSvg },
  ist: { filename: 'ist.svg', svg: istPatternSvg },
};

const PATTERN_LICENCES_MD = `# Travel journal leg patterns

Original decorative SVG motifs created for Life Hub Travel (2026). They are **not** traced from commercial batik or Iznik tile reproductions; they are simplified, hub-specific evocations for background use only.

| File | Inspiration | Licence |
|------|-------------|---------|
| \`kul.svg\` | Malaysian batik-style botanical leaves and wax-dot accents | © Life Hub — internal use; \`currentColor\` for theme tinting |
| \`ist.svg\` | Ottoman Iznik-style tulip and carnation rosettes | © Life Hub — internal use; \`currentColor\` for theme tinting |

Export bundles should include this file alongside the SVG assets.
`;

export interface ExportBundleFile {
  path: string;
  content: string;
  sha256: string;
  bytes: number;
}

export interface ExportMediaPlaceholder {
  id: string;
  checksum?: string;
  original_key?: string;
  derivative_keys?: Record<string, string>;
  bundle_paths: {
    original: string;
    display: string;
    derivatives: Record<string, string>;
  };
  transcript?: string;
  audio_bundle_path?: string | null;
}

export interface JournalExportManifest {
  bundle_version: number;
  exported_at: string;
  trip_id: string;
  journal_revision: number;
  files: Array<{ path: string; sha256: string; bytes: number }>;
  media: ExportMediaPlaceholder[];
  pattern_ids: string[];
}

type LiveRow = { lifecycle: JournalLifecycle };

function withoutDeleted<T extends LiveRow>(rows: T[]): T[] {
  return rows.filter((row) => row.lifecycle !== 'deleted');
}

/** Drop deleted rows before export (matches server GET without trash). */
export function stripJournalForExport(journal: JournalDocument): JournalDocument {
  return {
    ...journal,
    operations: [],
    legs: withoutDeleted(journal.legs),
    days: withoutDeleted(journal.days),
    moments: withoutDeleted(journal.moments),
    media: withoutDeleted(journal.media),
    transitions: withoutDeleted(journal.transitions),
  };
}

export async function sha256HexUtf8(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildJournalRouteGeoJson(journal: JournalDocument): GeoJSON.FeatureCollection {
  const liveMoments = journal.moments.filter((m) => m.lifecycle === 'live');
  const stops = buildPhotoStops(liveMoments);
  const segments = buildSegments(stops);
  const features: GeoJSON.Feature[] = segments.map((segment) => ({
    type: 'Feature',
    properties: { kind: 'segment', from: segment.fromMomentId, to: segment.toMomentId },
    geometry: { type: 'LineString', coordinates: segment.coordinates },
  }));
  for (const stop of stops) {
    features.push({
      type: 'Feature',
      properties: { kind: 'stop', momentId: stop.momentId },
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
    });
  }
  return { type: 'FeatureCollection', features };
}

function formatMomentLine(
  moment: JournalMoment,
  media: Map<string, JournalMedia>,
  journal: JournalDocument,
): string {
  const lines: string[] = [];
  lines.push(formatAuthorshipExportLabel(resolveMomentAuthor(moment)));
  const head = [moment.local_date, moment.local_time].filter(Boolean).join(' ');
  if (head) lines.push(head);
  if (moment.place?.name) lines.push(moment.place.name);
  if (moment.text?.trim()) lines.push(moment.text.trim());
  for (const id of moment.media_ids) {
    const item = media.get(id);
    if (!item) continue;
    if (item.caption?.trim()) lines.push(`[photo] ${item.caption.trim()}`);
    const extras = item as JournalMedia & { transcript?: string };
    if (extras.transcript?.trim()) lines.push(`[transcript] ${extras.transcript.trim()}`);
    const annotations = getMediaPhotoAnnotations(journal, id);
    if (annotations) lines.push(...formatMediaAnnotationsPlainText(annotations));
  }
  return lines.join('\n');
}

export function formatJournalPlainText(journal: JournalDocument): string {
  const media = new Map(journal.media.map((m) => [m.id, m]));
  const legs = [...journal.legs].sort((a, b) => a.order - b.order);
  const chunks: string[] = [journal.title || 'Untitled trip', ''];
  for (const leg of legs) {
    chunks.push(`## ${leg.destination}`, '');
    const moments = journal.moments
      .filter((m) => m.leg_id === leg.id && m.lifecycle === 'live')
      .sort((a, b) => a.display_order - b.display_order);
    for (const moment of moments) {
      chunks.push(formatMomentLine(moment, media, journal), '');
    }
  }
  return chunks.join('\n').trimEnd() + '\n';
}

function collectPatternIds(legs: JournalLeg[]): string[] {
  const ids = new Set<string>();
  for (const leg of legs) {
    if (leg.pattern_id && PATTERN_ASSETS[leg.pattern_id]) ids.add(leg.pattern_id);
  }
  return [...ids].sort();
}

function mediaPlaceholders(journal: JournalDocument): ExportMediaPlaceholder[] {
  const liveMedia = journal.media.filter((m) => m.lifecycle === 'live');
  return liveMedia.map((media) => {
    const extras = media as JournalMedia & { original_key?: string; derivative_keys?: Record<string, string>; transcript?: string };
    const derivatives: Record<string, string> = {};
    for (const width of [320, 960, 1600]) {
      derivatives[String(width)] = `media/${media.id}/der/${width}.jpg`;
    }
    return {
      id: media.id,
      checksum: media.checksum,
      original_key: extras.original_key,
      derivative_keys: extras.derivative_keys,
      bundle_paths: {
        original: `media/${media.id}/original`,
        display: `media/${media.id}/display.jpg`,
        derivatives,
      },
      transcript: extras.transcript,
      audio_bundle_path: null,
    };
  });
}

async function fileEntry(path: string, content: string): Promise<ExportBundleFile> {
  const sha256 = await sha256HexUtf8(content);
  return { path, content, sha256, bytes: new TextEncoder().encode(content).length };
}

export function exportReaderHasNoExternalNetwork(html: string): boolean {
  const extScript = /<script[^>]+src\s*=\s*["']https?:\/\//i.test(html);
  const extLink = /<link[^>]+href\s*=\s*["']https?:\/\//i.test(html);
  const cdn = /\bcdn\.|fonts\.googleapis|unpkg\.com|jsdelivr/i.test(html);
  return !extScript && !extLink && !cdn;
}

export interface BuildJournalExportBundleResult {
  manifest: JournalExportManifest;
  files: ExportBundleFile[];
}

export async function buildJournalExportBundle(
  journal: JournalDocument,
  exportedAt = new Date().toISOString(),
): Promise<BuildJournalExportBundleResult> {
  const stripped = stripJournalForExport(journal);
  const journalJson = JSON.stringify(stripped, null, 2);
  const plainText = formatJournalPlainText(stripped);
  const geoJson = JSON.stringify(buildJournalRouteGeoJson(stripped), null, 2);
  const mediaIndex = JSON.stringify({ items: mediaPlaceholders(stripped) }, null, 2);
  const annotationsJson = buildPhotoAnnotationsExportJson(stripped);

  const files: ExportBundleFile[] = [
    await fileEntry('data/journal.json', journalJson),
    await fileEntry('data/journal.txt', plainText),
    await fileEntry('data/annotations.json', annotationsJson),
    await fileEntry('geo/route.geojson', geoJson),
    await fileEntry('media/index.json', mediaIndex),
    await fileEntry('reader/index.html', exportReaderHtml),
    await fileEntry('licences/patterns.md', PATTERN_LICENCES_MD),
  ];

  for (const patternId of collectPatternIds(stripped.legs)) {
    const asset = PATTERN_ASSETS[patternId];
    files.push(await fileEntry(`patterns/${asset.filename}`, asset.svg));
  }

  const checksums = JSON.stringify(
    Object.fromEntries(files.map((f) => [f.path, f.sha256])),
    null,
    2,
  );
  files.push(await fileEntry('data/checksums.json', checksums));

  const manifest: JournalExportManifest = {
    bundle_version: JOURNAL_EXPORT_BUNDLE_VERSION,
    exported_at: exportedAt,
    trip_id: stripped.trip_id,
    journal_revision: stripped.revision,
    files: files.map((f) => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })),
    media: mediaPlaceholders(stripped),
    pattern_ids: collectPatternIds(stripped.legs),
  };

  return { manifest, files };
}

export function parseJournalJsonFromExportFiles(
  files: Record<string, string>,
): { journal: JournalDocument; gaps: string[] } {
  const raw = files['data/journal.json'];
  if (!raw) {
    throw new Error('Export is missing data/journal.json');
  }
  const journal = JSON.parse(raw) as JournalDocument;
  const gaps = [
    'Media blobs are not restored in this stub — only journal JSON is imported.',
    'Signed R2 re-upload and derivative regeneration are not implemented yet.',
  ];
  return { journal, gaps };
}

export interface RestoreJournalExportDeps {
  ensureJournal: (tripId: string) => Promise<{ journal: JournalDocument; version: string }>;
  saveJournal: (
    tripId: string,
    ifVersion: string,
    journal: JournalDocument,
  ) => Promise<{ journal: JournalDocument; version: string }>;
}

/** Stub restore: imports JSON document via ensureJournal + saveJournal (no media bytes). */
/** Download the portable export bundle as a single JSON file (manifest + file contents). */
export async function downloadJournalExportBundle(
  journal: JournalDocument,
  exportedAt = new Date().toISOString(),
): Promise<void> {
  const { manifest, files } = await buildJournalExportBundle(journal, exportedAt);
  const payload = {
    manifest,
    files: files.map((file) => ({ path: file.path, content: file.content })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `travel-journal-${journal.trip_id}-${exportedAt.slice(0, 10)}.json`;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function restoreJournalFromExport(
  tripId: string,
  files: Record<string, string>,
  deps: RestoreJournalExportDeps,
): Promise<{ envelope: { journal: JournalDocument; version: string }; gaps: string[] }> {
  const { journal: imported, gaps } = parseJournalJsonFromExportFiles(files);
  const envelope = await deps.ensureJournal(tripId);
  const next: JournalDocument = {
    ...imported,
    trip_id: tripId,
    id: envelope.journal.id,
    revision: envelope.journal.revision + 1,
  };
  const saved = await deps.saveJournal(tripId, envelope.version, next);
  return { envelope: saved, gaps };
}
