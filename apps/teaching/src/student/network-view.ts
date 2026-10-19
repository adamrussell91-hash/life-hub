import { apiGet } from '@/api/client';
import { CLASS_SITE_ORIGIN } from '@/app/class-site';
import type { LineStop, NetworkLine } from '@/schemas/block';
import { mountNetworkStage, networkLegend } from '@/network/draw';
import { buildYearNetwork, classNow } from '@/network/year';
import type { PublishedClassScheduleRow } from '@/student/published-class';

type PublishedNetwork = {
  lines: NetworkLine[];
  units: Array<{ id: string; title: string; lesson_ids: string[]; lessons: Array<{ id: string; line_stops?: LineStop[] }>; rail_line_ids: string[] }>;
  nudges: Record<string, { dx: number; dy: number }>;
};

/**
 * The year network on the class site: published units only, opened when the
 * student asks for it so the class page does not load it every time.
 */
export function renderStudentNetwork(classId: string, schedule: readonly PublishedClassScheduleRow[], today: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'student-panel student-network';
  section.dataset.classSection = 'network';
  const details = document.createElement('details');
  details.className = 'student-network__details';
  const summary = document.createElement('summary');
  summary.className = 'student-section-title student-network__summary';
  summary.textContent = 'The year as a network';
  const body = document.createElement('div');
  body.className = 'student-network__body';
  details.append(summary, body);
  section.append(details);

  let loaded = false;
  details.addEventListener('toggle', () => {
    if (!details.open || loaded) return;
    loaded = true;
    body.textContent = 'Loading…';
    void apiGet<PublishedNetwork>(`/api/published/networks/${encodeURIComponent(classId)}`)
      .then((data) => {
        if (!data.lines.length || !data.units.length) {
          body.textContent = 'Nothing on the network yet.';
          return;
        }
        const units = data.units.map((u) => ({
          id: u.id,
          title: u.title,
          href: `${CLASS_SITE_ORIGIN}/s/units/${u.id}`,
          lesson_ids: u.lesson_ids,
          lessons: u.lessons.map((l) => ({ id: l.id, title: '', ...(l.line_stops ? { line_stops: l.line_stops } : {}) })),
          railLineIds: u.rail_line_ids
        }));
        const now = classNow(units, schedule.filter((row) => row.published), today, 'You are here');
        const input = buildYearNetwork(data.lines, units, { nudges: data.nudges, ...(now ? { now } : {}) });
        body.replaceChildren(mountNetworkStage(input, { label: 'The year as a network' }), networkLegend('year'));
      })
      .catch(() => {
        loaded = false;
        body.textContent = 'Could not load the network. Close and open this again to retry.';
      });
  });
  return section;
}
