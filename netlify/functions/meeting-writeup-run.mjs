// Background: check who said each line, then write the meeting up (15 minute cap).
// Started by the worker's `transcript` action (with its bearer token) or by
// `POST /api/meeting-recordings?action=writeup` (with the operator cookie).
// Status lives on the recording (`writeup_status`). Never logs transcript text.

import { methodNotAllowed, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { completeJson } from './_shared/clare-comms-model.mjs';
import { defaultGetProfessionalStore, setJSON } from './_shared/professional-blobs.mjs';
import {
  carryReview,
  createWorkerGate,
  isRecordingMeetingId,
  meetingMeta,
  readRecording,
  readTranscript,
  readWriteup,
  recordingContext,
  writePeopleSaid,
  writeRecording,
  writeWriteup
} from './_shared/meeting-recordings-store.mjs';
import {
  applySpeakerCheck,
  parseSpeakerCheck,
  parseWriteup,
  resetSpeakerCheck,
  sentenceChunks,
  speakerCheckPrompt,
  writeupPrompt
} from './_shared/meeting-writeup.mjs';

export const config = { path: '/api/meeting-writeup-run', background: true };

const RUN_ID_RE = /^[0-9a-f-]{36}$/;

/** Is this still the run the recording is waiting on? (A delete or a newer run makes it stale.) */
async function stillCurrent(store, meetingId, runId) {
  const rec = await readRecording(store, meetingId);
  return rec && rec.writeup_job?.id === runId ? rec : null;
}

/**
 * One write-up run. Returns 'skipped' (not the current run, already started, private),
 * 'done', 'unchecked' (speaker check failed, write-up made) or 'failed'.
 */
export async function runMeetingWriteup(store, meetingId, runId, { complete, now = Date.now, log = () => {} }) {
  if (!isRecordingMeetingId(meetingId) || !RUN_ID_RE.test(runId ?? '')) return 'skipped';
  const rec = await readRecording(store, meetingId);
  if (!rec || rec.writeup_job?.id !== runId || rec.writeup_job.started_at) return 'skipped';
  if (rec.private) {
    rec.writeup_status = 'private_none';
    rec.writeup_job = null;
    rec.status = 'done';
    await writeRecording(store, rec);
    return 'skipped';
  }
  rec.writeup_job = { ...rec.writeup_job, started_at: new Date(now()).toISOString() };
  await writeRecording(store, rec);

  const transcript = await readTranscript(store, rec);
  const finish = async (status) => {
    const current = await stillCurrent(store, meetingId, runId);
    if (!current) return 'skipped';
    current.writeup_status = status;
    current.writeup_job = null;
    current.status = 'done';
    await writeRecording(store, current);
    return status;
  };
  if (!transcript) return finish('failed');

  const meta = await meetingMeta(store, meetingId, rec.started_at);
  const ctx = recordingContext(rec, meta);

  // 1. Speaker check, chunk by chunk, each with the checked lines before it as context.
  resetSpeakerCheck(transcript);
  let checked = true;
  const total = sentenceChunks(transcript).length;
  for (let i = 0; i < total; i += 1) {
    const chunk = sentenceChunks(transcript)[i];
    try {
      const reply = await complete(speakerCheckPrompt(ctx, chunk));
      applySpeakerCheck(transcript, parseSpeakerCheck(reply, chunk, ctx));
    } catch (error) {
      log('meeting-writeup speaker check failed', { meeting_id: meetingId, chunk: i, code: error?.code ?? 'error' });
      checked = false;
      break;
    }
  }
  transcript.speakers_checked = checked;
  if (!(await stillCurrent(store, meetingId, runId))) return 'skipped';
  await setJSON(store, rec.transcript_key, transcript);

  // 2. The write-up.
  let writeup;
  try {
    const reply = await complete(writeupPrompt(ctx, transcript, rec.notes, rec.flags));
    writeup = parseWriteup(reply, ctx, transcript, rec.notes, { nowIso: () => new Date(now()).toISOString() });
  } catch (error) {
    log('meeting-writeup failed', { meeting_id: meetingId, code: error?.code ?? 'error' });
    if (!(await stillCurrent(store, meetingId, runId))) return 'skipped';
    const previous = await readWriteup(store, meetingId);
    if (!previous) {
      await writeWriteup(store, meetingId, {
        status: 'failed', speakers_checked: checked, overview: '', flow: [], built: [],
        picks: { mine: [], others: [], poi: [] }, persons: [], review: { built: {}, picks: {} },
        error: 'Clare could not write this up. Try again.', created_at: new Date(now()).toISOString()
      });
    }
    return finish('failed');
  }
  if (!(await stillCurrent(store, meetingId, runId))) return 'skipped';
  // A rebuild keeps the ✓/✕ and pick states of items that came back the same.
  writeup = carryReview(await readWriteup(store, meetingId), writeup);
  await writeWriteup(store, meetingId, writeup);
  await writePeopleSaid(store, writeup, transcript, rec, meta);
  log('meeting-writeup done', { meeting_id: meetingId, lines: transcript.lines.length, status: writeup.status });
  return finish(writeup.status);
}

export function createMeetingWriteupRunHandler(deps = {}) {
  const run = async (request, context) => {
    const env = deps.env ?? context.env;
    if (request.method !== 'POST') return methodNotAllowed('POST, OPTIONS');
    const parsed = await readJsonObject(request);
    if (parsed.error) return parsed.error;
    const complete = deps.complete ?? ((input) => completeJson({ ...input, apiKey: env?.ANTHROPIC_API_KEY }));
    await runMeetingWriteup(context.store, parsed.value.meeting_id, parsed.value.run_id, {
      complete,
      now: deps.now,
      log: deps.log ?? ((message, ids) => console.log(message, JSON.stringify(ids)))
    });
    return new Response(null, { status: 202 });
  };
  const operator = createOperatorHandler(
    async (request, context) => withCors(await run(request, context), request, context.env),
    {
      ...deps,
      unboundCode: 'professional_blobs_unbound',
      unboundMessage: 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
  const worker = createWorkerGate(run, deps);
  return async function meetingWriteupRunHandler(request, context = {}) {
    return request.headers.get('authorization') ? worker(request, context) : operator(request, context);
  };
}

export default createMeetingWriteupRunHandler();
