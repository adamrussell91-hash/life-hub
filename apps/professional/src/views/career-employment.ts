import { renderRelationshipTimeline } from '@/components/relationship-timeline';
import type { CareerModel } from '@/domain/career-model';
import type { TimelineEntry } from '@/domain/types';
import { yearFraction } from '@/domain/career-river-geometry';

function plural(n: number, unit: string): string {
  return n === 1 ? `1 ${unit}` : `${n} ${unit}s`;
}

function durationPhrase(from: string, to: string | null | undefined, nowIso: string): string {
  const start = yearFraction(from);
  const end = yearFraction(to || nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '';
  const years = end - start;
  if (years < 1 / 12) return 'under a month';
  if (years < 1) return plural(Math.max(1, Math.round(years * 12)), 'month');
  const whole = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  if (months <= 0) return plural(whole, 'year');
  return `${plural(whole, 'year')} ${plural(months, 'month')}`;
}

function jobLabel(job: CareerModel['employment'][number]): string {
  const workplace = (job.display_label || job.label || '').trim();
  const role = (job.role || '').trim();
  if (role && workplace) return `${role} · ${workplace}`;
  return role || workplace || 'Role';
}

/**
 * Map Career employment into design-kit relationship-timeline entries.
 * Oldest first so the list reads as the career path (What happened).
 */
export function employmentToTimeline(
  employment: CareerModel['employment'],
  nowIso: string
): TimelineEntry[] {
  return employment
    .filter((job) => Boolean(job.valid_from))
    .slice()
    .sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)))
    .map((job, index) => {
      const role = (job.role || '').trim();
      const ref = job.ref || `employment:${index}`;
      return {
        id: `employment-${index}-${job.valid_from}-${role}`,
        kind: 'period',
        date: job.valid_from!,
        end_date: job.valid_to || null,
        label: jobLabel(job),
        context_key: durationPhrase(job.valid_from!, job.valid_to, nowIso) || null,
        source_ref: ref,
        target_ref: ref,
        href: null,
        context_href: null
      };
    });
}

/** Readable Work history — reuses relationship-timeline (not SVG pills). */
export function renderCareerEmployment(host: HTMLElement, model: CareerModel): void {
  const section = document.createElement('section');
  section.className = 'career-page__work';
  section.setAttribute('aria-label', 'Work history');

  const head = document.createElement('div');
  head.className = 'career-page__section-head';
  const title = document.createElement('h2');
  title.className = 'career-page__heading';
  title.textContent = 'Work';
  head.append(title);
  const note = document.createElement('p');
  note.className = 'career-page__meta';
  note.setAttribute('data-part', 'work-companion');
  const years =
    model.stats.years_behind != null ? ` · ${model.stats.years_behind} years behind you` : '';
  note.textContent = `Full dates & duration${years}`;
  head.append(note);
  section.append(head);

  const timeline = employmentToTimeline(model.employment, model.now);
  if (!timeline.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No employment periods on file yet.';
    section.append(empty);
  } else {
    const listHost = document.createElement('div');
    listHost.className = 'career-page__work-timeline';
    renderRelationshipTimeline(listHost, timeline);
    section.append(listHost);
  }

  host.append(section);
}
