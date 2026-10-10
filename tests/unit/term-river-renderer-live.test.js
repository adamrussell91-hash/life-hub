import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { capacityForDates } from '../../packages/design-kit/js/calendar/capacity-model.js';
import { renderTermRiver, unmountTermRiver } from '../../packages/design-kit/js/calendar/render-term-river.js';

const terms = [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }];
test('Term capacity uses live row forecasts and same-count edits repaint', async () => {
  const view = new Window({url: 'http://localhost/'});
  view.requestAnimationFrame = undefined;
  const host = view.document.createElement('div'); view.document.body.append(host);
  const input = {hub:'tasks',zoom:'term',today:'2026-10-14',terms, events:[{record:{id:'sleep-1',type:'sleep',date:'2026-10-14',duration_h:8}}]};
  try {
    renderTermRiver(view.document, host, input);
    view.__termRiver.finish();
    assert.match(host.querySelector('.tr-line.is-forecast').getAttribute('d'), /M/);
    await new Promise(resolve => setTimeout(resolve, 850));
    const old = host.querySelector('[data-part="chart"]');
    renderTermRiver(view.document, host, {...input, events:[{record:{...input.events[0].record,duration_h:4}}]});
    assert.notEqual(host.querySelector('[data-part="chart"]'), old);
  } finally { unmountTermRiver(); view.happyDOM.abort(); }
});


test('a hidden task remains hidden when switching from compact Term to Year', () => {
  const view = new Window({url: 'http://localhost/'});
  view.requestAnimationFrame = undefined;
  const host = view.document.createElement('div'); view.document.body.append(host);
  try {
    renderTermRiver(view.document, host, {hub:'life',zoom:'term',today:'2026-10-14',terms,events:[{record:{id:'task-filter',type:'task',title:'Deadline',due_date:'2026-10-14'}}]});
    view.__termRiver.finish();
    host.querySelector('button[data-filter="tasks"]').click();
    view.__termRiver.setZoom('year'); view.__termRiver.finish();
    const representations = [...host.querySelectorAll('[data-id="task-filter"]')];
    assert.ok(representations.length >= 2);
    for (const item of representations) assert.equal(item.getAttribute('visibility'), 'hidden');
  } finally { unmountTermRiver(); view.happyDOM.abort(); }
});

test('Year splits sparse logged history from unlogged forecast gaps', () => {
  const view = new Window({url: 'http://localhost/'});
  view.requestAnimationFrame = undefined;
  const host = view.document.createElement('div'); view.document.body.append(host);
  try {
    renderTermRiver(view.document, host, {hub:'life',zoom:'year',today:'2026-10-14',terms,events:[
      {record:{id:'sleep-12',type:'sleep',date:'2026-10-12',duration_h:8}},
      {record:{id:'sleep-14',type:'sleep',date:'2026-10-14',duration_h:5}}
    ]});
    view.__termRiver.finish();
    assert.equal(host.querySelectorAll('.tr-line:not(.is-forecast)').length, 2);
    assert.ok(host.querySelectorAll('.tr-line.is-forecast').length >= 2);
    for (const line of host.querySelectorAll('.tr-line')) assert.match(line.getAttribute('d'), /^M/);
  } finally { unmountTermRiver(); view.happyDOM.abort(); }
});

test('live current date wins over an illustration date for readiness', () => {
  const view = new Window({url: 'http://localhost/'});
  view.requestAnimationFrame = undefined;
  const host = view.document.createElement('div'); view.document.body.append(host);
  try {
    renderTermRiver(view.document, host, {hub:'life',zoom:'term',today:'2026-10-14',terms,visual:{RIVER:{TODAY:'2026-10-12'}},events:[{record:{id:'sleep-live',type:'sleep',date:'2026-10-14',duration_h:3}}]});
    view.__termRiver.finish();
    const expected = capacityForDates([{record:{id:'sleep-live',type:'sleep',date:'2026-10-14',duration_h:3}}], ['2026-10-14'], {today:'2026-10-14'}).get('2026-10-14').pct;
    assert.equal(view.__termRiver.capacity('2026-10-14'), expected);
  } finally { unmountTermRiver(); view.happyDOM.abort(); }
});
