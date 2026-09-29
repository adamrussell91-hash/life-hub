import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { buildSystemPrompt, CALENDAR_WRITE_GUIDANCE } from '../../netlify/functions/_shared/persona.mjs';

const AGENTS = [
  'brisket', 'chadwick', 'hyaluronica', 'penelope', 'sara',
  'vera', 'hammond', 'ann', 'clementine', 'clare'
];

test('A4: all ten agents get calendar write tools and CALENDAR_WRITE_GUIDANCE', () => {
  resetCapabilityCaches();
  for (const slug of AGENTS) {
    const tools = buildAgentTools({
      slug,
      needsHammondTools: slug === 'hammond',
      needsSaraMedicalTools: slug === 'sara',
      allowedTypes: slug === 'sara' ? ['medical'] : undefined,
      message: 'put breakfast on Saturday at 9 and log that I emailed Kate'
    });
    const names = new Set(tools.map(tool => tool.name));
    assert.ok(names.has('propose_calendar_ghost'), `${slug} missing propose_calendar_ghost`);
    assert.ok(names.has('propose_log_communication'), `${slug} missing propose_log_communication`);
    assert.ok(names.has('create_task'), `${slug} missing create_task`);
    assert.ok(names.has('list_calendar_blocks'), `${slug} missing list_calendar_blocks`);
    assert.ok(capabilityIdsForAgent(slug).includes('publish.calendar-ghost'), slug);
    const prompt = buildSystemPrompt({ slug, today: '2026-10-04' });
    assert.ok(prompt.includes(CALENDAR_WRITE_GUIDANCE), `${slug} prompt missing CALENDAR_WRITE_GUIDANCE`);
    assert.match(prompt, /propose_calendar_ghost/);
    assert.match(prompt, /Never say you cannot put things on his calendar/);
  }
});
