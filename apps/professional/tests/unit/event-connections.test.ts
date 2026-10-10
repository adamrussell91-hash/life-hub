import {afterEach, describe, expect, it, vi} from 'vitest';
import {buildEventConnections, buildEventTaskPanel} from '@/views/events';
import {linkEventTask} from '@/api/events';
import type {EventRecord} from '@/domain/types';
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async () => ({outgoing:[], incoming:[{
    link:{id:'ul_learning', source_ref:'tasks:task:task_1', target_ref:'professional:event:event_1', relationship_type:'learning_for', status:'current'},
    endpoint:{ref:'tasks:task:task_1', kind:'task', display_label:'Apply close reading to Year 10', href:'/tasks/#/task/task_1'}
  }]})),
  suppressUniversalLink: vi.fn(async () => ({}))
}));
vi.mock('@/api/events',()=>({linkEventTask:vi.fn(async()=>({})),isEventTaskLinkIncompleteError:()=>false,retryEventTaskLink:vi.fn(async()=>({}))}));
afterEach(() => document.body.replaceChildren());
describe('event connections', () => {
  it.each(['task_1', 'Old task title'])('prefers the current task name over a journal title of %s', async (oldTitle) => {
    const host=buildEventTaskPanel({id:'event_1',learning_operation:{status:'committed',task_id:'task_1',title:oldTitle}} as EventRecord, async()=>{});
    document.body.append(host);
    await vi.waitFor(()=>expect(host.querySelector('a')?.textContent).toBe('Apply close reading to Year 10'));
    expect(host.textContent).not.toContain(oldTitle);
  });
  it('shows named linked tasks and supports the shared New task flow alongside Connections', async () => {
    const host=buildEventTaskPanel({id:'event_1',learning_operation:{status:'committed',task_id:'task_1',title:'Apply close reading to Year 10'}} as EventRecord, async()=>{});
    document.body.append(host);
    await vi.waitFor(()=>expect(host.textContent).toContain('Apply close reading to Year 10'));
    expect(host.querySelector('.task-link-panel')).not.toBeNull();
    expect(host.querySelector('h3')?.textContent).toBe('Follow-up tasks');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/tasks/#/task/task_1');
    expect(host.textContent).not.toContain('task_1');
    const reload=vi.fn(async()=>{});
    const taskHost=buildEventTaskPanel({id:'event_1'} as EventRecord,reload);
    document.body.append(taskHost);
    await vi.waitFor(()=>expect(taskHost.querySelector('[data-task-link-submit]')?.hasAttribute('disabled')).toBe(false));
    taskHost.querySelector<HTMLInputElement>('[aria-label="Follow-up tasks title"]')!.value='Apply new learning';
    taskHost.querySelector<HTMLButtonElement>('[data-task-link-submit]')!.click();
    await vi.waitFor(()=>expect(linkEventTask).toHaveBeenCalledWith('event_1',{relationship_type:'learning_for',title:'Apply new learning'}));
    expect(reload).toHaveBeenCalled();
    const connections=buildEventConnections({id:'event_1'} as EventRecord,async()=>{});
    document.body.append(connections);
    expect(connections.querySelector('.entity-tagger')).not.toBeNull();
    expect(connections.querySelector('.task-link-panel')).toBeNull();

  });
});
