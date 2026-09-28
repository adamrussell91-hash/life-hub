import { describe, expect, it } from 'vitest';
import { renderLinkedEverywhere, linkedEverywhereCount } from '@/components/linked-everywhere';
import type { LinkedRecords, RelationshipEndpoint } from '@/domain/types';

function endpoint(ref: string, label: string, href: string | null = null): RelationshipEndpoint {
  const [, kind] = ref.split(':');
  return {
    ref,
    kind: kind as RelationshipEndpoint['kind'],
    display_label: label,
    supporting_label: null,
    href,
    lifecycle_status: 'active',
    visibility: 'operator'
  };
}

const empty: LinkedRecords = { tasks: [], communications: [], organisations: [], people: [] };

describe('renderLinkedEverywhere', () => {
  it('shows notes, projects, teaching and other kinds — not only the original five buckets', () => {
    const records: LinkedRecords = {
      ...empty,
      tasks: [endpoint('tasks:task:t1', 'Send reference')],
      notes: [endpoint('knowledge:page:p1', 'Coaching notes', '/knowledge/#/page/p1')],
      projects: [endpoint('tasks:project:pr1', 'Literacy push')],
      teaching: [endpoint('teaching:lesson:l1', 'Poetry 3')],
      other: [endpoint('life:decision:d1', 'Take the role')]
    };
    const host = document.createElement('div');
    renderLinkedEverywhere(host, records);
    const text = host.textContent ?? '';
    expect(text).toMatch(/Tasks · 1\s*Send reference/);
    expect(text).toMatch(/Knowledge notes · 1\s*Coaching notes/);
    expect(text).toMatch(/Projects & goals · 1\s*Literacy push/);
    expect(text).toMatch(/Teaching · 1\s*Poetry 3/);
    expect(text).toMatch(/Other · 1\s*Take the role/);
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/knowledge/#/page/p1');
    expect(linkedEverywhereCount(records)).toBe(5);
  });

  it('never lists people or organisations and shows an empty state when nothing else is linked', () => {
    const host = document.createElement('div');
    renderLinkedEverywhere(host, {
      ...empty,
      people: [endpoint('shared:person:x', 'Someone')],
      organisations: [endpoint('shared:organisation:y', 'School')]
    });
    expect(host.textContent).toMatch(/Nothing is linked yet/);
    expect(host.textContent).not.toMatch(/Someone|School/);
  });
});
