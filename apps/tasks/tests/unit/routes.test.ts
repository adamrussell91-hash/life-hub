import { describe, expect, it } from 'vitest';
import {
  hashViewId,
  isKnownHashView,
  knownHubViews,
  parseBacklogTriage,
  parseEntityPage,
  parseHashRoute,
  parseMapItemPage,
  parseNewExcursionPage,
  parseSomedaySubPage
} from '@/shell/shell';

describe('hash routes', () => {
  it('includes Maps in the known rail views', () => {
    expect(knownHubViews()).toContain('maps');
  });

  it('includes Programs in the known rail views', () => {
    expect(knownHubViews()).toContain('programs');
  });

  it('resolves #/programs to the programs view', () => {
    location.hash = '#/programs';
    expect(hashViewId()).toBe('programs');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('programs');
  });

  it('keeps old Universe / Orbit / Branch hashes known and maps them to Graph', () => {
    expect(knownHubViews()).toContain('universe');
    location.hash = '#/universe';
    expect(hashViewId()).toBe('universe');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('graph');
    location.hash = '#/orbit';
    expect(parseHashRoute()).toBe('graph');
    location.hash = '#/branch';
    expect(parseHashRoute()).toBe('graph');
  });

  it('resolves #/maps to the maps view', () => {
    location.hash = '#/maps';
    expect(hashViewId()).toBe('maps');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('maps');
  });

  it('aliases retired #/constellation to Graph so old Sky links do not 404', () => {
    location.hash = '#/constellation';
    expect(hashViewId()).toBe('constellation');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('graph');
    expect(knownHubViews()).not.toContain('constellation');
  });

  it('treats unknown hashes as not-known instead of silently being maps', () => {
    location.hash = '#/definitely-missing';
    expect(isKnownHashView()).toBe(false);
    expect(parseHashRoute()).toBe('board');
  });

  it('recognises map card page hashes without adding them to the rail', () => {
    location.hash = '#/maps/map_mindworks_2026/station/st_advocacy';
    expect(parseMapItemPage()).toEqual({
      mapId: 'map_mindworks_2026',
      kind: 'station',
      id: 'st_advocacy'
    });
    expect(isKnownHashView()).toBe(true);
    expect(hashViewId()).toBe('maps');
    expect(parseHashRoute()).toBe('maps');

    location.hash = '#/maps/map_mindworks_2026/event/tk_muna';
    expect(parseMapItemPage()).toEqual({
      mapId: 'map_mindworks_2026',
      kind: 'event',
      id: 'tk_muna'
    });
  });

  it('recognises task and project page hashes without adding them to the rail', () => {
    location.hash = '#/task/task_lesson';
    expect(parseEntityPage()).toEqual({ kind: 'task', id: 'task_lesson' });
    expect(isKnownHashView()).toBe(true);
    expect(knownHubViews()).not.toContain('task');

    location.hash = '#/project/proj_mindworks';
    expect(parseEntityPage()).toEqual({ kind: 'project', id: 'proj_mindworks' });
    expect(isKnownHashView()).toBe(true);
    expect(knownHubViews()).not.toContain('project');
  });

  it('recognises the new excursion page without adding it to the rail', () => {
    location.hash = '#/excursions/new';
    expect(parseNewExcursionPage()).toBe(true);
    expect(isKnownHashView()).toBe(true);
    expect(hashViewId()).toBe('excursions');
    expect(parseHashRoute()).toBe('excursions');
    expect(knownHubViews()).not.toContain('new');

    location.hash = '#/excursions/new?template=ext_ethics_olympiad';
    expect(parseNewExcursionPage()).toBe(true);
    expect(parseNewExcursionPage('#/excursions')).toBe(false);
  });

  it('includes Goals and Someday in the Plan section', () => {
    expect(knownHubViews()).toContain('goals');
    expect(knownHubViews()).toContain('someday');
    location.hash = '#/goals';
    expect(hashViewId()).toBe('goals');
    expect(parseHashRoute()).toBe('goals');
    location.hash = '#/someday';
    expect(hashViewId()).toBe('someday');
    expect(parseHashRoute()).toBe('someday');
  });

  it('aliases #/backlog to the list view and recognises triage', () => {
    location.hash = '#/backlog';
    expect(hashViewId()).toBe('backlog');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('list');
    expect(parseBacklogTriage()).toBe(false);

    location.hash = '#/list';
    expect(parseHashRoute()).toBe('list');
    expect(parseBacklogTriage()).toBe(false);

    location.hash = '#/backlog/triage';
    expect(hashViewId()).toBe('backlog');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('list');
    expect(parseBacklogTriage()).toBe(true);
    expect(knownHubViews()).not.toContain('backlog');
  });

  it('recognises the Someday sub-pages without adding them to the rail', () => {
    location.hash = '#/someday/wheel';
    expect(parseSomedaySubPage()).toEqual({ kind: 'wheel' });
    expect(isKnownHashView()).toBe(true);
    expect(hashViewId()).toBe('someday');
    expect(knownHubViews()).not.toContain('wheel');

    location.hash = '#/someday/odyssey/task_someday_podcast';
    expect(parseSomedaySubPage()).toEqual({ kind: 'odyssey', taskId: 'task_someday_podcast' });
    expect(isKnownHashView()).toBe(true);

    location.hash = '#/someday';
    expect(parseSomedaySubPage()).toBeNull();

    location.hash = '#/someday/odyssey';
    expect(parseSomedaySubPage()).toBeNull();
  });
});
