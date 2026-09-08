/**
 * Deterministic visual evidence capture after an image turn.
 * If the model already recorded meaningful evidence, do nothing.
 * Otherwise run one bounded continuation that may only call record_visual_evidence.
 */

import {
  listHasMeaningfulVisualEvidence,
  mergeVisualEvidenceLists,
  normalizeVisualEvidenceList,
  recordVisualEvidenceToolSchema,
  VISUAL_EVIDENCE_FALLBACK_NUDGE,
  VISUAL_EVIDENCE_FALLBACK_SYSTEM,
  visualTraceFields
} from '../../../packages/design-kit/js/hub-visual-evidence.js';
import { streamWithAgentLogForce } from './agent-log-force.mjs';

/**
 * @param {object} anthropic
 * @param {{
 *   needsVisualCapture?: boolean,
 *   getRecordedVisualEvidence?: () => unknown[],
 *   setRecordedVisualEvidence?: (items: unknown[]) => void,
 *   onVisualEvidence?: (items: unknown[], meta: { captureSource: string }) => void,
 *   attachments?: unknown[],
 *   priorVisualEvidence?: unknown[],
 *   keepFullDomainTools?: boolean,
 *   hasVisualEvidence?: boolean,
 *   slug?: string,
 *   userMessage?: string,
 *   [key: string]: unknown
 * }} opts
 */
export async function* streamWithVisualEvidenceCapture(anthropic, opts = {}) {
  const {
    needsVisualCapture = false,
    getRecordedVisualEvidence,
    setRecordedVisualEvidence,
    onVisualEvidence,
    attachments = [],
    priorVisualEvidence = [],
    keepFullDomainTools = false,
    hasVisualEvidence = false,
    ...rest
  } = opts;

  let streamOpts = { ...rest };
  let assistantText = '';
  let modelRecordedMeaningful = false;

  if (typeof streamOpts.executeTools === 'function') {
    const innerExecute = streamOpts.executeTools;
    streamOpts = {
      ...streamOpts,
      executeTools: async (toolCall) => {
        const result = await innerExecute(toolCall);
        if (toolCall?.name === 'record_visual_evidence') {
          const current = typeof getRecordedVisualEvidence === 'function'
            ? getRecordedVisualEvidence()
            : [];
          if (listHasMeaningfulVisualEvidence(current)) {
            modelRecordedMeaningful = true;
          }
        }
        return result;
      }
    };
  }

  for await (const event of streamWithAgentLogForce(anthropic, streamOpts)) {
    if (event.type === 'text' && typeof event.delta === 'string') {
      assistantText += event.delta;
    }
    yield event;
  }

  const recordedAfterMain = typeof getRecordedVisualEvidence === 'function'
    ? normalizeVisualEvidenceList(getRecordedVisualEvidence())
    : [];
  if (listHasMeaningfulVisualEvidence(recordedAfterMain)) {
    modelRecordedMeaningful = true;
  }

  if (!needsVisualCapture || modelRecordedMeaningful) {
    if (needsVisualCapture && modelRecordedMeaningful) {
      yield {
        type: 'status',
        text: 'Visual evidence captured…',
        visual: visualTraceFields({
          attachments,
          visualEvidence: recordedAfterMain,
          visualContextRestored: priorVisualEvidence.length > 0,
          toolsUnnarrowed: keepFullDomainTools,
          modelHasImageBlocks: hasVisualEvidence,
          meaningfulVisualEvidenceCaptured: true,
          captureSource: 'model_tool_call'
        })
      };
    }
    return;
  }

  yield {
    type: 'status',
    text: 'Capturing visual evidence…',
    visual: visualTraceFields({
      attachments,
      visualEvidence: recordedAfterMain,
      visualContextRestored: priorVisualEvidence.length > 0,
      toolsUnnarrowed: keepFullDomainTools,
      modelHasImageBlocks: hasVisualEvidence,
      meaningfulVisualEvidenceCaptured: false,
      captureSource: 'fallback_extraction'
    })
  };

  const captureTool = recordVisualEvidenceToolSchema();
  let fallbackItems = [];

  const captureMessages = [
    ...(streamOpts.messages ?? []),
    {
      role: 'assistant',
      content: assistantText || '(answered without recording visual evidence)'
    },
    { role: 'user', content: VISUAL_EVIDENCE_FALLBACK_NUDGE }
  ];

  for await (const event of anthropic.streamMessage({
    system: VISUAL_EVIDENCE_FALLBACK_SYSTEM,
    messages: captureMessages,
    tools: [captureTool],
    toolChoice: { type: 'tool', name: 'record_visual_evidence' },
    signal: streamOpts.signal,
    maxTokens: 1200,
    executeTools: async (toolCall) => {
      if (toolCall?.name !== 'record_visual_evidence') {
        return JSON.stringify({ ok: false, error: 'only_record_visual_evidence_allowed' });
      }
      const items = normalizeVisualEvidenceList(toolCall.input?.items);
      fallbackItems = mergeVisualEvidenceLists(fallbackItems, items);
      if (typeof setRecordedVisualEvidence === 'function') {
        const merged = mergeVisualEvidenceLists(
          typeof getRecordedVisualEvidence === 'function' ? getRecordedVisualEvidence() : [],
          fallbackItems
        );
        setRecordedVisualEvidence(merged);
      }
      if (typeof onVisualEvidence === 'function') {
        onVisualEvidence(fallbackItems, { captureSource: 'fallback_extraction' });
      }
      return JSON.stringify({
        ok: true,
        recorded: fallbackItems.length,
        captureSource: 'fallback_extraction'
      });
    }
  })) {
    // Surface tool/status events; suppress leftover assistant chatter from the capture round.
    if (event.type === 'text') continue;
    yield event;
  }

  const finalEvidence = typeof getRecordedVisualEvidence === 'function'
    ? normalizeVisualEvidenceList(getRecordedVisualEvidence())
    : fallbackItems;

  yield {
    type: 'status',
    text: listHasMeaningfulVisualEvidence(finalEvidence)
      ? 'Visual evidence captured…'
      : 'Visual evidence capture incomplete…',
    visual: visualTraceFields({
      attachments,
      visualEvidence: finalEvidence,
      visualContextRestored: priorVisualEvidence.length > 0,
      toolsUnnarrowed: keepFullDomainTools,
      modelHasImageBlocks: hasVisualEvidence,
      meaningfulVisualEvidenceCaptured: listHasMeaningfulVisualEvidence(finalEvidence),
      captureSource: 'fallback_extraction'
    })
  };
}
