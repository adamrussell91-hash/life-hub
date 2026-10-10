import {afterEach, describe, expect, it, vi} from 'vitest';
import {buildEventConnections} from '@/views/events';
import {suppressUniversalLink} from '@/api/universal-links';
import type {EventRecord} from '@/domain/types';
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async () => ({outgoing:[], incoming:[{
    link:{id:'ul_learning', source_ref:'tasks:task:task_1', target_ref:'professional:event:event_1', relationship_type:'learning_for', status:'current'},
    endpoint:{ref:'tasks:task:task_1', kind:'task', display_label:'Apply close reading to Year 10', href:'/tasks/#/task/task_1'}
  }]})),
  suppressUniversalLink: vi.fn(async () => ({}))
}));
afterEach(() => document.body.replaceChildren());
describe('event connections', () => {
  it.each(['task_1', 'Old task title'])('prefers the current task name over a journal title of %s', async (oldTitle) => {
    const host=buildEventConnections({id:'event_1',learning_operation:{status:'committed',task_id:'task_1',title:oldTitle}} as EventRecord, async()=>{});
    document.body.append(host);
    await vi.waitFor(()=>expect(host.querySelector('a')?.textContent).toBe('Apply close reading to Year 10'));
    expect(host.textContent).not.toContain(oldTitle);
  });
  it('shows existing learning links using the same Connections tagger as Comms and Meetings', async () => {
    const host=buildEventConnections({id:'event_1',learning_operation:{status:'committed',task_id:'task_1',title:'Apply close reading to Year 10'}} as EventRecord, async()=>{});
    document.body.append(host);
    await vi.waitFor(()=>expect(host.textContent).toContain('Apply close reading to Year 10'));
    expect(host.querySelector('.entity-tagger')).not.toBeNull();
    expect(host.querySelector('h3')?.textContent).toBe('Connections');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/tasks/#/task/task_1');
    expect(host.textContent).not.toContain('task_1');
    expect(host.textContent).not.toContain('Up to 10');
    expect(host.querySelector('.task-link-panel')).toBeNull();
    host.querySelector<HTMLButtonElement>('[aria-label="Remove Apply close reading to Year 10"]')!.click();
    await vi.waitFor(()=>expect(suppressUniversalLink).toHaveBeenCalledWith('ul_learning'));
    expect(host.querySelector('a')).toBeNull();
  });
});
