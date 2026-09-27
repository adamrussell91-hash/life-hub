import { renderRelationshipTimeline } from '@/components/relationship-timeline';
import type { CareerModel } from '@/domain/career-model';
import type { TimelineEntry } from '@/domain/types';
import { yearFraction } from '@/domain/career-river-geometry';

function durationPhrase(from: string, to: string | null | undefined, nowIso: string): string {
  const start = yearFraction(from);
  const end = yearFraction(to || nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '';
  const years = end - start;
  if (years < 1 / 12) return 'under a month';
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return months === 1 ? '1 month' : `${months} months`;
  }
  const whole = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  if (months <= 0) return whole === 1 ? '1 year' : `${whole} years`;
  const y = whole === 1 ? '1 year' : `${whole} years`;
  const m = months === 1 ? '1 month' : `${months} months`;
  return `${y} ${m}`;
}

/**
 * Map Career employment into design-kit relationship-timeline entries.
 * Oldest first so the list reads as the career path (What happened).
 */
export function employmentToTimeline(
  employment: CareerModel['employment'],
  nowIso: string
): TimelineEntry[] {
  const dated = employment
    .filter((job) => Boolean(job.valid_from))
    .slice()
    .sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)));

  return dated.map((job, index) => {
    const workplace = (job.display_label || job.label || '').trim();
    const role = (job.role || '').trim();
    const label =
      role && workplace ? `${role} · ${workplace}` : role || workplace || 'Role';
    const duration = durationPhrase(job.valid_from!, job.valid_to, nowIso);
    const open = !job.valid_to;
    return {
      id: `employment-${index}-${job.valid_from}-${role}`,
      kind: 'period',
      date: job.valid_from!,
      end_date: open ? null : job.valid_to!,
      label,
      context_key: duration || null,
      source_ref: job.ref || `employment:${index}`,
      target_ref: job.ref || `employment:${index}`,
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
  section.style.background = 'var(--glass)';
  section.style.border = '1px solid var(--line)';
  section.style.borderRadius = 'var(--radius-md)';
  section.style.boxShadow = 'var(--elev-1)';
  section.style.padding = 'var(--space-4)';

  const head = document.createElement('div');
  head.className = 'career-page__section-head';
  const title = document.createElement('h2');
  title.className = 'career-page__heading';
  title.textContent = 'Work';
  head.append(title);
  if (model.stats.years_behind != null) {
    const note = document.createElement('p');
    note.className = 'career-page__meta';
    note.textContent = `${model.stats.years_behind} years behind you`;
    head.append(note);
  }
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
