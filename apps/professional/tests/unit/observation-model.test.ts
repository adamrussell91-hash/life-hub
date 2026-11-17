import { describe, expect, it } from 'vitest';
import { PROFICIENT_DESCRIPTORS, descriptorByCode } from '@/observation/descriptors';
import {
  addDescriptor, addLogLineAt, agreedDescriptors, extraDescriptors, setDescriptorExtra, addLookFor, assignLookForKeys, clockLabel, clockMs, deleteLogEntry, draftFeedback, editLogEntry,
  endClock, gatherWriteUp, notesFor, logEntry, newObservation, pauseClock, removeDescriptor, removeLookFor, renameLookFor,
  parseClock, resumeClock, setLessonEnd, setLessonStart, startClock, tally, windowDay, windowTone
} from '@/observation/model';
import type { Observation } from '@/observation/types';

// Invented people only.
const T0 = Date.parse('2026-11-18T01:00:00.000Z');
const at = (sec: number) => new Date(T0 + sec * 1000);

function base(): Observation {
  return newObservation({
    teacher: { person_ref: 'shared:person:p_sam', name: 'Sam Okafor', school: 'Riverbend High' },
    supervisorName: 'Jo Supervisor',
    plannedOn: '2026-11-16',
    meetingId: 'meeting_00000000-0000-4000-8000-000000000001',
    phase: 'planning',
    now: at(0)
  });
}

function planned(codes = ['3.5.2', '5.2.2']): Observation {
  let o = base();
  for (const c of codes) {
    const r = addDescriptor(o, c);
    if (!r.ok) throw new Error(r.reason);
    o = r.observation;
  }
  return o;
}

describe('descriptors', () => {
  it('has all 37 Proficient descriptors, each with a standard and text', () => {
    expect(PROFICIENT_DESCRIPTORS).toHaveLength(37);
    expect(new Set(PROFICIENT_DESCRIPTORS.map((d) => d.code)).size).toBe(37);
    expect(PROFICIENT_DESCRIPTORS.every((d) => d.text.length > 10 && d.focus && d.code.endsWith('.2'))).toBe(true);
    expect(descriptorByCode('3.5.2')?.standard).toBe(3);
  });
});

describe('picking descriptors and look-fors', () => {
  it('starts empty with the meeting linked for its phase', () => {
    const o = base();
    expect(o.meetings).toEqual({ planning: 'meeting_00000000-0000-4000-8000-000000000001' });
    expect(o.id).toMatch(/^obs_[a-z0-9-]{8,64}$/);
    expect(o.clock).toEqual({ started_at: null, paused_ms: 0, paused_at: null, ended_at: null });
  });

  it('takes 4 agreed, then 2 extras, then refuses; also refuses duplicates and unknown codes', () => {
    const four = planned(['1.5.2', '3.5.2', '5.2.2', '4.2.2']);
    expect(four.descriptors).toHaveLength(4);
    const fifth = addDescriptor(four, '2.2.2');
    if (!fifth.ok) throw new Error(fifth.reason);
    expect(fifth.observation.descriptors.at(-1)).toMatchObject({ code: '2.2.2', extra: true });
    const sixth = addDescriptor(fifth.observation, '6.3.2');
    if (!sixth.ok) throw new Error(sixth.reason);
    expect(extraDescriptors(sixth.observation).map((d) => d.code)).toEqual(['2.2.2', '6.3.2']);
    expect(addDescriptor(sixth.observation, '5.1.2')).toMatchObject({ ok: false });
    expect(addDescriptor(four, '3.5.2')).toMatchObject({ ok: false });
    expect(addDescriptor(base(), '9.9.9')).toMatchObject({ ok: false });
  });

  it('moves a descriptor between agreed and extra within the limits, agreed first', () => {
    let o = planned(['3.5.2', '5.2.2', '1.5.2']);
    const r = setDescriptorExtra(o, '3.5.2', true);
    if (!r.ok) throw new Error(r.reason);
    o = r.observation;
    expect(o.descriptors.map((d) => `${d.code}${d.extra ? '*' : ''}`)).toEqual(['5.2.2', '1.5.2', '3.5.2*']);
    expect(agreedDescriptors(o).map((d) => d.code)).toEqual(['5.2.2', '1.5.2']);
    const back = setDescriptorExtra(o, '3.5.2', false);
    expect(back.ok && back.observation.descriptors.every((d) => !d.extra)).toBe(true);
    const full = planned(['1.5.2', '3.5.2', '5.2.2', '4.2.2']);
    const extra = addDescriptor(full, '2.2.2');
    if (!extra.ok) throw new Error(extra.reason);
    expect(setDescriptorExtra(extra.observation, '2.2.2', false)).toMatchObject({ ok: false });
  });

  it('keeps extras out of drafted feedback', () => {
    let o = planned(['3.5.2', '5.2.2']);
    const r = addDescriptor(o, '6.3.2', { extra: true });
    if (!r.ok) throw new Error(r.reason);
    o = startClock(r.observation, at(0));
    o = logEntry(o, { descriptor: '6.3.2', kind: 'strength', text: 'Took the mentor’s advice' }, at(60));
    const w = gatherWriteUp(o);
    expect(w['6.3.2'].practice).toContain('Took the mentor’s advice');
    w['6.3.2'] = { ...w['6.3.2'], decision: 'observed' };
    expect(Object.keys(draftFeedback({ ...o, write_up: w }))).toEqual(['3.5.2', '5.2.2']);
  });

  it('a next step counts toward Partially unless switched off', () => {
    let o = startClock(planned(['3.5.2']), at(0));
    o = logEntry(o, { descriptor: '3.5.2', kind: 'strength', text: 'Clear' }, at(10));
    o = logEntry(o, { descriptor: '3.5.2', kind: 'next', text: 'Slow down' }, at(20));
    expect(tally(o)['3.5.2'].suggestion).toBe('partial');
    o = editLogEntry(o, o.log[1].id, { counts_partial: false });
    expect(tally(o)['3.5.2']).toMatchObject({ suggestion: 'observed', next: 1 });
  });

  it('gives look-fors the keys of their descriptor row, three to a row, extras blank', () => {
    let o = planned(['3.5.2', '5.2.2', '1.5.2', '4.2.2']);
    for (const code of ['3.5.2', '5.2.2', '1.5.2', '4.2.2']) {
      for (const label of ['one', 'two', 'three', 'four']) o = addLookFor(o, code, label);
    }
    expect(o.descriptors.map((d) => d.look_fors.map((l) => l.key).join(''))).toEqual(['QWE', 'ASD', 'ZXC', 'RTY'].map((r) => r));
    expect(o.descriptors[0].look_fors[3].key).toBe('');
    // Removing the first descriptor moves the next one up a row.
    const without = removeDescriptor(o, '3.5.2');
    expect(without.descriptors[0].code).toBe('5.2.2');
    expect(without.descriptors[0].look_fors.slice(0, 3).map((l) => l.key)).toEqual(['Q', 'W', 'E']);
    expect(assignLookForKeys([])).toEqual([]);
  });

  it('renames and removes look-fors without touching the original record', () => {
    const start = addLookFor(planned(), '3.5.2', 'Short instructions');
    const id = start.descriptors[0].look_fors[0].id;
    const renamed = renameLookFor(start, '3.5.2', id, 'Chunked instructions');
    expect(renamed.descriptors[0].look_fors[0].label).toBe('Chunked instructions');
    expect(start.descriptors[0].look_fors[0].label).toBe('Short instructions');
    const logged = logEntry(renamed, { descriptor: '3.5.2', look_for: id, kind: 'strength', text: 'ok' }, at(5));
    const removed = removeLookFor(logged, '3.5.2', id);
    expect(removed.descriptors[0].look_fors).toHaveLength(0);
    expect(removed.log[0].look_for).toBeNull();
  });
});

describe('lesson clock', () => {
  it('counts from Start, stops while paused, and stops at End', () => {
    let o = base();
    expect(clockMs(o, at(100))).toBe(0);
    o = startClock(o, at(0));
    expect(clockMs(o, at(90))).toBe(90_000);
    o = pauseClock(o, at(120));
    expect(clockMs(o, at(500))).toBe(120_000);
    o = resumeClock(o, at(300));
    expect(clockMs(o, at(360))).toBe(180_000);
    o = endClock(o, at(400));
    expect(clockMs(o, at(9999))).toBe(220_000);
  });

  it('ends at the pause when ended while paused', () => {
    let o = pauseClock(startClock(base(), at(0)), at(60));
    o = endClock(o, at(600));
    expect(clockMs(o, at(900))).toBe(60_000);
    expect(o.clock.paused_at).toBeNull();
  });

  it('labels mm:ss, rolling hours into minutes', () => {
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(65_000)).toBe('01:05');
    expect(clockLabel(3_905_000)).toBe('65:05');
  });
});

describe('log', () => {
  it('stamps the clock time, allows said lines with no descriptor, and edits and deletes', () => {
    let o = startClock(planned(), at(0));
    o = logEntry(o, { descriptor: '3.5.2', kind: 'strength', text: 'Clear instruction' }, at(75));
    o = logEntry(o, { kind: 'said', text: 'Student asked a question' }, at(130));
    expect(o.log.map((l) => l.clock)).toEqual(['01:15', '02:10']);
    expect(o.log[1].descriptor).toBeNull();
    const id = o.log[0].id;
    o = editLogEntry(o, id, { text: 'Very clear instruction' });
    expect(o.log[0].text).toBe('Very clear instruction');
    o = deleteLogEntry(o, id);
    expect(o.log).toHaveLength(1);
  });
});

describe('tally', () => {
  it('suggests nothing, observed, or partial', () => {
    let o = addLookFor(planned(['3.5.2', '5.2.2', '1.5.2']), '3.5.2', 'Short instructions');
    const lf = o.descriptors[0].look_fors[0].id;
    o = startClock(o, at(0));
    o = logEntry(o, { descriptor: '3.5.2', look_for: lf, kind: 'strength', text: 'Chunked' }, at(10));
    o = logEntry(o, { descriptor: '3.5.2', look_for: lf, kind: 'strength', text: 'Chunked again' }, at(20));
    o = logEntry(o, { descriptor: '5.2.2', kind: 'strength', text: 'Named a criterion' }, at(30));
    o = logEntry(o, { descriptor: '5.2.2', kind: 'next', text: 'Reach the back table' }, at(40));
    o = logEntry(o, { descriptor: '1.5.2', kind: 'ask', text: 'Why those starters?' }, at(50));
    const t = tally(o);
    expect(t['3.5.2']).toMatchObject({ strengths: 2, next: 0, suggestion: 'observed', lookHits: { [lf]: 2 } });
    expect(t['5.2.2']).toMatchObject({ strengths: 1, next: 1, suggestion: 'partial' });
    expect(t['1.5.2'].suggestion).toBeNull();
  });
});

describe('setting the start by hand', () => {
  it('starts a clock that was never started and times the log from it', () => {
    let o = logEntry(planned(), { kind: 'transition', text: 'Into groups' }, at(600));
    expect(o.log[0].clock).toBe('00:00');
    o = setLessonStart(o, at(0), at(900));
    expect(o.clock.started_at).toBe(at(0).toISOString());
    expect(o.clock.ended_at).toBeNull();
    expect(o.log[0].clock).toBe('10:00');
    expect(clockMs(o, at(900))).toBe(900_000);
  });

  it('moves an existing start and shifts timed lines, keeping pauses', () => {
    let o = startClock(planned(), at(120));
    o = pauseClock(o, at(180));
    o = resumeClock(o, at(240));
    o = logEntry(o, { kind: 'transition', text: 'Pack up' }, at(300)); // 02:00 running time
    expect(o.log[0].clock).toBe('02:00');
    o = setLessonStart(o, at(0), at(400));
    expect(o.log[0].clock).toBe('04:00');
    expect(o.clock.paused_ms).toBe(60_000);
  });

  it('refuses a start in the future', () => {
    const o = planned();
    expect(setLessonStart(o, at(500), at(100))).toBe(o);
  });
});

describe('setting the lesson end by hand', () => {
  it('moves an end that was pressed late, keeping log times', () => {
    let o = startClock(planned(), at(0));
    o = logEntry(o, { kind: 'transition', text: 'Pack up' }, at(600));
    o = endClock(o, at(6000));
    o = setLessonEnd(o, at(3000), at(7000));
    expect(o.clock.ended_at).toBe(at(3000).toISOString());
    expect(clockMs(o, at(7000))).toBe(3_000_000);
    expect(o.log[0].clock).toBe('10:00');
  });

  it('ends a running or paused clock, counting time up to the end', () => {
    let o = pauseClock(startClock(planned(), at(0)), at(600));
    o = setLessonEnd(o, at(1200), at(1500));
    expect(o.clock.paused_at).toBeNull();
    expect(clockMs(o, at(1500))).toBe(1_200_000);
  });

  it('refuses no start, an end at or before the start, and the future', () => {
    const none = planned();
    expect(setLessonEnd(none, at(100), at(200))).toBe(none);
    const o = startClock(planned(), at(100));
    expect(setLessonEnd(o, at(100), at(200))).toBe(o);
    expect(setLessonEnd(o, at(500), at(200))).toBe(o);
  });
});

describe('fixing the log after the fact', () => {
  function logged(): Observation {
    let o = addLookFor(planned(), '3.5.2', 'Short instructions');
    o = startClock(o, at(0));
    o = logEntry(o, { descriptor: '3.5.2', look_for: o.descriptors[0].look_fors[0].id, kind: 'strength', text: 'Chunked' }, at(60));
    o = logEntry(o, { kind: 'transition', text: 'Into groups' }, at(300));
    return o;
  }

  it('reads typed times', () => {
    expect(parseClock('12:30')).toBe('12:30');
    expect(parseClock('7')).toBe('07:00');
    expect(parseClock('3:5')).toBeNull();
    expect(parseClock('soon')).toBeNull();
  });

  it('changes a line’s time, descriptor, kind and words, and keeps clock order', () => {
    const o = logged();
    const id = o.log[0].id;
    const e = editLogEntry(o, id, { clock: '9:00', descriptor: '5.2.2', kind: 'next', text: ' Repeat the cue ' });
    expect(e.log.map((l) => l.clock)).toEqual(['05:00', '09:00']);
    const line = e.log.find((l) => l.id === id)!;
    expect(line).toMatchObject({ descriptor: '5.2.2', look_for: null, kind: 'next', text: 'Repeat the cue', at: at(540).toISOString() });
    // A later start change still shifts the edited line.
    expect(setLessonStart(e, at(-60), at(900)).log.find((l) => l.id === id)!.clock).toBe('10:00');
    // A bad time changes nothing.
    expect(editLogEntry(o, id, { clock: 'later' })).toBe(o);
  });

  it('turning a line into a transition drops its descriptor', () => {
    const o = logged();
    const e = editLogEntry(o, o.log[0].id, { kind: 'transition' });
    expect(e.log[0]).toMatchObject({ kind: 'transition', descriptor: null, look_for: null });
  });

  it('adds a missed line in clock order', () => {
    const o = addLogLineAt(logged(), { descriptor: '3.5.2', kind: 'strength', text: 'Checked for understanding', clock: '02:30' }, at(900));
    expect(o.log.map((l) => l.clock)).toEqual(['01:00', '02:30', '05:00']);
    expect(o.log[1]).toMatchObject({ text: 'Checked for understanding', at: at(150).toISOString() });
    expect(addLogLineAt(logged(), { kind: 'strength', text: 'x', clock: 'nope' }, at(900)).log).toHaveLength(2);
  });
});

describe('gather and feedback', () => {
  function observed(): Observation {
    let o = addLookFor(planned(), '3.5.2', 'Short instructions');
    const lf = o.descriptors[0].look_fors[0].id;
    o = startClock(o, at(0));
    o = logEntry(o, { descriptor: '3.5.2', look_for: lf, kind: 'strength', text: 'Chunked the task' }, at(75));
    o = logEntry(o, { descriptor: '3.5.2', kind: 'next', text: 'Repeat the transition cue' }, at(300));
    o = logEntry(o, { descriptor: '5.2.2', kind: 'strength', text: 'Named a criterion.' }, at(400));
    return o;
  }

  it('gathers practice and strengths, oldest first', () => {
    const w = gatherWriteUp(observed());
    expect(w['3.5.2'].practice).toBe('Look-fors: Short instructions.\n01:15 Short instructions: Chunked the task');
    expect(w['3.5.2'].strengths).toBe('Chunked the task.\nNext step: Repeat the transition cue.');
    expect(w['5.2.2'].strengths).toBe('Named a criterion.');
  });

  it('leaves edited cells, decisions and comments alone', () => {
    const o = observed();
    const withEdits: Observation = {
      ...o,
      write_up: { '3.5.2': { practice: 'My own words', strengths: 'old', decision: 'partial', comments: 'keep me', edited: ['practice'] } }
    };
    const w = gatherWriteUp(withEdits);
    expect(w['3.5.2'].practice).toBe('My own words');
    expect(w['3.5.2'].strengths).toContain('Chunked the task.');
    expect(w['3.5.2'].decision).toBe('partial');
    expect(w['3.5.2'].comments).toBe('keep me');
  });

  it('starts each row from Planning, before anything is logged, and feedback skips the planned lines', () => {
    let o = addLookFor(planned(), '3.5.2', 'Short instructions');
    o = { ...o, descriptors: o.descriptors.map((d) => d.code === '3.5.2'
      ? { ...d, demonstrate: 'Model the task, then release in chunks', planned_impact: 'Students start within a minute', how_know: 'Exit ticket' }
      : d) };
    const w = gatherWriteUp(o);
    expect(w['3.5.2'].practice).toBe('Planned: Model the task, then release in chunks.\nLook-fors: Short instructions.');
    expect(w['3.5.2'].strengths).toBe('Planned impact: Students start within a minute.\nHow we will know: Exit ticket.');
    expect(w['5.2.2'].practice).toBe('');

    o = startClock(o, at(0));
    o = logEntry(o, { descriptor: '3.5.2', kind: 'strength', text: 'Chunked the task' }, at(75));
    const g = gatherWriteUp(o);
    expect(g['3.5.2'].practice.split('\n')).toEqual(['Planned: Model the task, then release in chunks.', 'Look-fors: Short instructions.', '01:15 Chunked the task']);
    g['3.5.2'] = { ...g['3.5.2'], decision: 'observed' };
    expect(draftFeedback({ ...o, write_up: g })['3.5.2'].feedback).toBe('Chunked the task.');
  });

  it('refills a cell that was edited and then cleared', () => {
    const o = observed();
    const w = gatherWriteUp({ ...o, write_up: { '3.5.2': { practice: '', strengths: '', decision: null, comments: '', edited: ['practice', 'strengths'] } } });
    expect(w['3.5.2'].practice).toBe('Look-fors: Short instructions.\n01:15 Short instructions: Chunked the task');
  });

  it('drafts feedback by decision and leaves edited feedback and teacher text', () => {
    const o = observed();
    const g = gatherWriteUp(o);
    g['3.5.2'] = { ...g['3.5.2'], decision: 'partial' };
    g['5.2.2'] = { ...g['5.2.2'], decision: 'observed' };
    const withDecisions: Observation = { ...o, write_up: g, reflection: { '3.5.2': { teacher: 'My thoughts', feedback: '', feedback_edited: false } } };
    const r = draftFeedback(withDecisions);
    expect(r['3.5.2'].feedback).toBe('Chunked the task.\n\nTo develop: Repeat the transition cue.');
    expect(r['3.5.2'].teacher).toBe('My thoughts');
    expect(r['5.2.2'].feedback).toBe('Named a criterion.');

    const edited: Observation = { ...withDecisions, reflection: { ...r, '5.2.2': { ...r['5.2.2'], feedback: 'Mine', feedback_edited: true } } };
    expect(draftFeedback(edited)['5.2.2'].feedback).toBe('Mine');

    // Observed does not carry a to-develop line even when next steps were logged.
    const obsOnly: Observation = { ...withDecisions, write_up: { ...g, '3.5.2': { ...g['3.5.2'], decision: 'observed' } } };
    expect(draftFeedback(obsOnly)['3.5.2'].feedback).toBe('Chunked the task.');

    // No decision yet: nothing is drafted.
    expect(draftFeedback({ ...o, write_up: gatherWriteUp(o), reflection: {} })['3.5.2'].feedback).toBe('');
  });
});

describe('notes', () => {
  it('picks paragraphs that name the exact code', () => {
    const text = '4.5.2 - ethical ICT\n14.5.2 not this\n4.5.21 nor this\nCredited sources (4.5.2, 7.1.2)\nNo code';
    expect(notesFor('4.5.2', text)).toEqual(['4.5.2 - ethical ICT', 'Credited sources (4.5.2, 7.1.2)']);
    expect(notesFor('4.5.2', undefined)).toEqual([]);
  });
});

describe('two-week window', () => {
  it('counts days from the planning day and tones them', () => {
    expect(windowDay('2026-11-16', '2026-11-16')).toBe(1);
    expect(windowDay('2026-11-16', '2026-11-27')).toBe(12);
    expect(windowDay('2026-11-16', new Date(2026, 10, 30))).toBe(15);
    expect([1, 11, 12, 14, 15, 20].map(windowTone)).toEqual(['calm', 'calm', 'amber', 'amber', 'rose', 'rose']);
  });
});
