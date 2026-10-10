import type { JournalDocument } from '@/api/journal';
import {
  filterMomentsForPerspectiveDisplay,
  formatAuthorshipExportLabel,
  resolveMomentAuthor,
} from '@/journal/corey-perspective';
import { formatMediaAnnotationsPlainText, getMediaPhotoAnnotations } from '@/journal/annotations';
import { isFixtureMediaUrl, journalMediaDerivativeUrl } from '@/journal/media-loading';
import { transitionForFromLeg } from '@/journal/transitions';
import { resolveMediaTranscriptText } from '@/journal/transcripts';
import type { JournalFixture, JournalMedia, JournalMoment } from '@/journal/types';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export const JOURNAL_PRINT_DERIVATIVE_WIDTH = 960;

export const JOURNAL_PRINT_CSS = `
  @page { size: A4 portrait; margin: 14mm; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #1a1a1a;
    background: #fff;
  }
  .journal-print {
    box-sizing: border-box;
    max-width: 180mm;
    margin: 0 auto;
    padding: 0;
  }
  .journal-print__title {
    font-size: 1.35rem;
    font-weight: 600;
    margin: 0 0 1.25rem;
  }
  .journal-print-leg:not(:first-of-type) {
    break-before: page;
    page-break-before: always;
  }
  .journal-print-day + .journal-print-day {
    break-before: page;
    page-break-before: always;
  }
  .journal-print-leg__title {
    font-size: 1.15rem;
    margin: 0 0 0.75rem;
  }
  .journal-print-day__date {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
    color: #333;
  }
  .journal-print-moment {
    margin: 0 0 1rem;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .journal-print-moment__meta {
    font-size: 0.85rem;
    color: #444;
    margin: 0 0 0.35rem;
  }
  .journal-print-moment__text {
    margin: 0.35rem 0 0.5rem;
    white-space: pre-wrap;
  }
  .journal-print-moment__photos {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.35rem 0 0;
  }
  .journal-print-moment__photos img {
    max-width: 100%;
    height: auto;
    display: block;
  }
  .journal-print-moment__photos--pair img {
    width: calc(50% - 0.2rem);
    flex: 1 1 calc(50% - 0.2rem);
  }
  .journal-print-transition {
    margin: 1rem 0;
    padding: 0.5rem 0;
    border-top: 1px solid #ccc;
    font-size: 0.9rem;
    color: #555;
    break-inside: avoid;
  }
  .journal-print-annotation,
  .journal-print-transcript {
    font-size: 0.85rem;
    color: #444;
    margin: 0.25rem 0 0;
  }
`;

export interface JournalPrintEditionOptions {
  tripId: string;
  title?: string;
  showCoreyPerspective?: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function journalPrintImageSrc(tripId: string, media: JournalMedia): string {
  if (isFixtureMediaUrl(media.url)) return media.url;
  return journalMediaDerivativeUrl(tripId, media.id, JOURNAL_PRINT_DERIVATIVE_WIDTH);
}

export function journalPrintEditionHasNoRemoteFonts(html: string): boolean {
  if (/fonts\.googleapis|fonts\.gstatic|use\.typekit|cloud\.typography/i.test(html)) return false;
  if (/@import\s+url\s*\(\s*["']?https?:/i.test(html)) return false;
  return true;
}

export function journalPrintEditionHasNoExternalNetwork(html: string): boolean {
  const extScript = /<script[^>]+src\s*=\s*["']https?:\/\//i.test(html);
  const extLink = /<link[^>]+href\s*=\s*["']https?:\/\//i.test(html);
  const cdn = /\bcdn\.|unpkg\.com|jsdelivr/i.test(html);
  return !extScript && !extLink && !cdn && journalPrintEditionHasNoRemoteFonts(html);
}

function renderMomentBlock(
  journal: JournalDocument,
  moment: JournalMoment,
  mediaById: Map<string, JournalMedia>,
  tripId: string,
): string {
  const parts: string[] = [];
  const meta: string[] = [];
  meta.push(escapeHtml(formatAuthorshipExportLabel(resolveMomentAuthor(moment))));
  if (moment.local_time) meta.push(escapeHtml(moment.local_time));
  if (moment.place?.name) meta.push(escapeHtml(moment.place.name));

  parts.push('<article class="journal-print-moment">');
  parts.push(`<p class="journal-print-moment__meta">${meta.join(' · ')}</p>`);

  const liveMedia = moment.media_ids
    .map((id) => mediaById.get(id))
    .filter((m): m is JournalMedia => Boolean(m && m.lifecycle === 'live'));

  if (liveMedia.length > 0) {
    const pair = liveMedia.length === 2;
    parts.push(
      `<div class="journal-print-moment__photos${pair ? ' journal-print-moment__photos--pair' : ''}">`,
    );
    for (const item of liveMedia) {
      const src = escapeHtml(journalPrintImageSrc(tripId, item));
      parts.push(`<img src="${src}" alt="" width="${item.width}" height="${item.height}" />`);
    }
    parts.push('</div>');
  }

  if (moment.text?.trim()) {
    parts.push(`<p class="journal-print-moment__text">${escapeHtml(moment.text.trim())}</p>`);
  }

  for (const id of moment.media_ids) {
    const item = mediaById.get(id);
    if (!item) continue;
    const transcript = resolveMediaTranscriptText(journal, item);
    if (transcript) {
      parts.push(
        `<p class="journal-print-transcript">[transcript] ${escapeHtml(transcript)}</p>`,
      );
    }
    const annotations = getMediaPhotoAnnotations(journal, id);
    if (annotations) {
      for (const line of formatMediaAnnotationsPlainText(annotations)) {
        parts.push(`<p class="journal-print-annotation">${escapeHtml(line)}</p>`);
      }
    }
  }

  parts.push('</article>');
  return parts.join('');
}

export function renderJournalPrintBody(
  journal: JournalFixture,
  options: JournalPrintEditionOptions,
): string {
  const tripId = options.tripId;
  const showCorey = options.showCoreyPerspective !== false;
  const mediaById = new Map(journal.media.map((m) => [m.id, m]));
  const legs = [...journal.legs]
    .filter((l) => l.lifecycle === 'live')
    .sort((a, b) => a.order - b.order);

  const chunks: string[] = [];
  chunks.push('<div class="journal-print">');
  const heading = options.title?.trim() || journal.title.trim() || 'Travel journal';
  chunks.push(`<h1 class="journal-print__title">${escapeHtml(heading)}</h1>`);

  for (const leg of legs) {
    chunks.push(`<section class="journal-print-leg" data-journal-print-leg="${escapeHtml(leg.id)}">`);
    chunks.push(`<h2 class="journal-print-leg__title">${escapeHtml(leg.destination)}</h2>`);

    const days = journal.days
      .filter((d) => d.leg_id === leg.id && d.lifecycle === 'live')
      .sort((a, b) => a.local_date.localeCompare(b.local_date));

    for (const day of days) {
      chunks.push(
        `<section class="journal-print-day" data-journal-print-day="${escapeHtml(day.id)}">`,
      );
      chunks.push(
        `<h3 class="journal-print-day__date">${escapeHtml(formatDisplayDate(day.local_date))}</h3>`,
      );

      const moments = filterMomentsForPerspectiveDisplay(
        journal.moments
          .filter(
            (m) =>
              m.lifecycle === 'live' &&
              m.leg_id === leg.id &&
              m.local_date === day.local_date,
          )
          .sort((a, b) => a.display_order - b.display_order),
        showCorey,
      );

      if (day.empty_marker && moments.length === 0) {
        chunks.push('<p class="journal-print-moment__meta">No moments this day.</p>');
      }

      for (const moment of moments) {
        chunks.push(renderMomentBlock(journal as JournalDocument, moment, mediaById, tripId));
      }
      chunks.push('</section>');
    }
    chunks.push('</section>');

    const trn = transitionForFromLeg(journal, leg.id);
    if (trn) {
      const label = [trn.departure_label, trn.arrival_label].filter(Boolean).join(' → ');
      const date = trn.local_date ? formatDisplayDate(trn.local_date) : '';
      chunks.push(
        `<p class="journal-print-transition">${escapeHtml(
          [trn.mode, date, label].filter(Boolean).join(' · '),
        )}</p>`,
      );
    }
  }

  chunks.push('</div>');
  return chunks.join('');
}

export function buildJournalPrintHtml(
  journal: JournalFixture,
  options: JournalPrintEditionOptions,
): string {
  const title = options.title?.trim() || journal.title.trim() || 'Travel journal';
  const body = renderJournalPrintBody(journal, options);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — print</title>
  <style>${JOURNAL_PRINT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function waitForPrintImages(doc: Document, timeoutMs = 2000): Promise<void> {
  const images = Array.from(doc.querySelectorAll('img'));
  if (images.length === 0) return;
  await Promise.race([
    Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    ),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}

/** Opens a dedicated print document (inline CSS, derivative photos, leg/day page breaks). */
export function openJournalPrintEdition(
  journal: JournalFixture,
  options: JournalPrintEditionOptions,
): void {
  const html = buildJournalPrintHtml(journal, options);
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) {
    window.alert('Allow pop-ups to open the printable journal.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  void waitForPrintImages(printWindow.document).then(() => {
    printWindow.focus();
  });
}
