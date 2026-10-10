import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {apiGet, apiPost, apiPatch, clearEventReadCache} from '@/api/client';

const response = (data: unknown) => new Response(JSON.stringify({ok:true, data}), {status:200});
beforeEach(() => { clearEventReadCache(); vi.stubGlobal('fetch', vi.fn(async () => response({event:{id:'event_one', title:'Saved'}, events:[]}))); });
afterEach(() => { clearEventReadCache(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('event navigation cache', () => {
  it('reuses the list, event, links and group reads on repeat navigation', async () => {
    const paths = ['/api/events', '/api/events?id=event_one', '/api/universal-links?entity_ref=professional%3Aevent%3Aevent_one', '/api/pd-groups?id=group_one'];
    for (const path of paths) {await apiGet(path); await apiGet(path);}
    expect(fetch).toHaveBeenCalledTimes(paths.length);
  });
  it('shares overlapping requests and gives each view its own copy', async () => {
    let finish!: (value:Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise(resolve => {finish = resolve;}));
    const one = apiGet<{event:{title:string}}>('/api/events?id=event_one');
    const two = apiGet<{event:{title:string}}>('/api/events?id=event_one');
    finish(response({event:{title:'Saved'}}));
    const [a,b] = await Promise.all([one,two]);
    a.event.title = 'Unsaved';
    expect(b.event.title).toBe('Saved');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('expires reads after a minute and supports explicit refresh', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await apiGet('/api/events'); now += 60001; await apiGet('/api/events');
    clearEventReadCache(); await apiGet('/api/events');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it.each(['/api/events?id=event_one&action=delete', '/api/universal-links', '/api/pd-groups', '/api/logout'])('invalidates all event dependencies after %s', async path => {
    await apiGet('/api/events'); await apiGet('/api/events?id=event_one');
    await apiPost(path, {});
    await apiGet('/api/events'); await apiGet('/api/events?id=event_one');
    expect(fetch).toHaveBeenCalledTimes(5);
  });
  it('invalidates on edit and does not let an older pending GET refill the cache', async () => {
    let finish!: (value:Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const old = apiGet('/api/events');
    await apiPatch('/api/events?id=event_one', {title:'New'});
    finish(response({events:[{title:'Old'}]})); await old;
    await apiGet('/api/events');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('aborting one reader leaves the shared request usable for another', async () => {
    let finish!: (value:Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise(resolve => {finish = resolve;}));
    const controller = new AbortController();
    const first = apiGet('/api/events', {signal:controller.signal});
    const second = apiGet('/api/events');
    controller.abort();
    await expect(first).rejects.toMatchObject({name:'AbortError'});
    finish(response({events:[]})); await second;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retain failed or unauthorized reads', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ok:false,error:{code:'unauthenticated',message:'Sign in'}}),{status:401}));
    await expect(apiGet('/api/events')).rejects.toMatchObject({status:401});
    await apiGet('/api/events'); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
