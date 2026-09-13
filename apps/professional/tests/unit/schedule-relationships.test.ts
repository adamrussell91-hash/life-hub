import { describe, expect, it } from 'vitest';
import { renderRelationshipSection } from '@/components/schedule-relationships';
import type { UniversalLinkEntry } from '@/api/universal-links';

describe('renderRelationshipSection', () => {
  it('renders a clickable link when the endpoint has a resolved href', () => {
    const host = document.createElement('div');
    const entries: UniversalLinkEntry[] = [
      {
        link: {
          id: 'l1',
          source_ref: 'professional:meeting:meeting_1',
          target_ref: 'tasks:task:task_1',
          relationship_type: 'preparation',
          status: 'current'
        },
        endpoint: {
          ref: 'tasks:task:task_1',
          kind: 'task',
          display_label: 'Prepare agenda',
          href: '/tasks/#/task/task_1'
        },
        direction: 'outgoing'
      }
    ];
    renderRelationshipSection(host, entries, 'No relationships.');
    const link = host.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/tasks/#/task/task_1');
    expect(link?.textContent).toBe('preparation · Prepare agenda');
  });

  it('falls back to plain text when the endpoint has no resolved href', () => {
    const host = document.createElement('div');
    const entries: UniversalLinkEntry[] = [
      {
        link: {
          id: 'l2',
          source_ref: 'professional:meeting:meeting_1',
          target_ref: 'shared:person:person_1',
          relationship_type: 'attendee',
          status: 'current',
          role: 'chair'
        },
        endpoint: {
          ref: 'shared:person:person_1',
          kind: 'person',
          display_label: 'Seth Example',
          href: null
        },
        direction: 'outgoing'
      }
    ];
    renderRelationshipSection(host, entries, 'No relationships.');
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('li')?.textContent).toBe('attendee · Seth Example (chair)');
  });

  it('shows the empty label when there are no entries', () => {
    const host = document.createElement('div');
    renderRelationshipSection(host, [], 'No relationships yet.');
    expect(host.textContent).toMatch(/No relationships yet\./);
  });
});
