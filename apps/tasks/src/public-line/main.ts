/** Public page for a published personal line: `line.html#<code>`. No sign-in, no hub chrome. */
import { apiGet } from '@/api/client';
import type { LineSnapshot } from '@/personal-line/model';
import { mountPersonalLine } from '@/personal-line/render';
import '@/personal-line/personal-line.css';
import './page.css';

const host = document.getElementById('line')!;

function status(text: string): void {
  const p = document.createElement('p');
  p.className = 'pl-page__status';
  p.textContent = text;
  host.replaceChildren(p);
}

function published(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function load(): Promise<void> {
  const code = decodeURIComponent(location.hash.replace(/^#/, '').trim());
  if (!/^[a-z0-9]{8,24}$/.test(code)) {
    status('This link is missing its line code. Ask for the link again.');
    return;
  }
  try {
    const snap = await apiGet<LineSnapshot>(`/api/published/lines/${encodeURIComponent(code)}`);
    document.title = snap.student_name ? `${snap.student_name}’s line · MindWorks Pathways` : 'MindWorks Pathways';
    const when = published(snap.created_at);
    mountPersonalLine(host, snap, { animate: true, stamp: when ? `Published ${when}` : String(snap.year) });
  } catch {
    status('This line isn’t published any more, or the link is wrong. Ask for a new link.');
  }
}

window.addEventListener('hashchange', () => void load());
void load();
