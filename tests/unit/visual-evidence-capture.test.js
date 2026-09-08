import test from 'node:test';
import assert from 'node:assert/strict';
import { streamWithVisualEvidenceCapture } from '../../netlify/functions/_shared/visual-evidence-capture.mjs';
import {
  listHasMeaningfulVisualEvidence,
  normalizeVisualEvidenceList,
  VISUAL_EVIDENCE_STUB_NOTE
} from '../../packages/design-kit/js/hub-visual-evidence.js';

function mockAnthropic({ mainToolCalls = [], fallbackToolCall = null, mainText = 'Looks like a label.' } = {}) {
  return {
    async *streamMessage({ executeTools, system }) {
      const isFallback = typeof system === 'string' && /Life Hub bounded visual evidence capture/i.test(system);
      if (isFallback) {
        if (fallbackToolCall && typeof executeTools === 'function') {
          const event = {
            type: 'tool_call',
            id: 'tool_fallback',
            name: 'record_visual_evidence',
            input: fallbackToolCall
          };
          await executeTools(event);
          yield event;
        }
        yield { type: 'done' };
        return;
      }

      yield { type: 'text', delta: mainText };
      for (const [index, input] of mainToolCalls.entries()) {
        const event = {
          type: 'tool_call',
          id: `tool_main_${index}`,
          name: 'record_visual_evidence',
          input
        };
        if (typeof executeTools === 'function') await executeTools(event);
        yield event;
      }
      yield { type: 'done' };
    }
  };
}

test('model-supplied meaningful evidence skips fallback capture', async () => {
  let recorded = [];
  const events = [];
  const anthropic = mockAnthropic({
    mainToolCalls: [{
      items: [{
        attachmentId: 'att1',
        transcribedText: 'Protein 42 g',
        claims: [{ kind: 'nutrition_value', label: 'Protein', value: 42, unit: 'g', source: 'direct_visual' }]
      }]
    }],
    fallbackToolCall: {
      items: [{ attachmentId: 'att1', sceneNotes: 'should not run' }]
    }
  });

  for await (const event of streamWithVisualEvidenceCapture(anthropic, {
    needsVisualCapture: true,
    slug: 'brisket',
    userMessage: 'Here is my lunch.',
    messages: [{ role: 'user', content: 'Here is my lunch.' }],
    tools: [],
    getRecordedVisualEvidence: () => recorded,
    setRecordedVisualEvidence: (items) => { recorded = items; },
    executeTools: async (toolCall) => {
      if (toolCall.name === 'record_visual_evidence') {
        recorded = normalizeVisualEvidenceList(toolCall.input?.items);
        return JSON.stringify({ ok: true, recorded: recorded.length });
      }
      return null;
    },
    attachments: [{ id: 'att1', kind: 'image', mime: 'image/png', name: 'label.png', dataUrl: 'data:image/png;base64,xx' }],
    hasVisualEvidence: true
  })) {
    events.push(event);
  }

  assert.equal(listHasMeaningfulVisualEvidence(recorded), true);
  assert.ok(events.some((event) => event.type === 'status' && event.visual?.captureSource === 'model_tool_call'));
  assert.ok(!events.some((event) => event.visual?.captureSource === 'fallback_extraction'));
});

test('missing model evidence triggers bounded fallback capture', async () => {
  let recorded = [];
  const events = [];
  const anthropic = mockAnthropic({
    mainToolCalls: [],
    fallbackToolCall: {
      items: [{
        attachmentId: 'att1',
        transcribedText: 'Protein 42.0 g\nFat 14.5 g',
        structuredFields: { protein_g: 42, fat_g: 14.5 },
        claims: [
          { kind: 'nutrition_value', label: 'Protein', value: 42, unit: 'g', source: 'direct_visual' },
          { kind: 'nutrition_value', label: 'Fat', value: 14.5, unit: 'g', source: 'direct_visual' }
        ]
      }]
    }
  });

  for await (const event of streamWithVisualEvidenceCapture(anthropic, {
    needsVisualCapture: true,
    slug: 'brisket',
    userMessage: 'Here is my lunch.',
    messages: [{ role: 'user', content: 'Here is my lunch.' }],
    tools: [],
    getRecordedVisualEvidence: () => recorded,
    setRecordedVisualEvidence: (items) => { recorded = items; },
    onVisualEvidence: (items) => { recorded = normalizeVisualEvidenceList(items); },
    executeTools: async () => JSON.stringify({ ok: true }),
    attachments: [{ id: 'att1', kind: 'image', mime: 'image/png', name: 'label.png', dataUrl: 'data:image/png;base64,xx' }],
    hasVisualEvidence: true
  })) {
    events.push(event);
  }

  assert.equal(listHasMeaningfulVisualEvidence(recorded), true);
  assert.ok(events.some((event) => event.visual?.captureSource === 'fallback_extraction'));
  assert.ok(recorded[0].claims.some((claim) => claim.label === 'Protein' && Number(claim.value) === 42));
  assert.notEqual(recorded[0].sceneNotes, VISUAL_EVIDENCE_STUB_NOTE);
});
