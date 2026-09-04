import { isChatJobId } from './chat-job-store.mjs';

const FLUSH_EVERY_EVENTS = 8;

export async function runStoredChatJob({
  jobId,
  store,
  createHandler,
  handlerDeps = {}
} = {}) {
  if (typeof createHandler !== 'function') return false;
  if (!isChatJobId(jobId) || !store) return false;
  const job = await store.get(jobId);
  if (!job || typeof job.body !== 'string') return false;

  const meta = {
    owner: job.owner,
    body: job.body,
    url: job.url,
    cookie: job.cookie ?? '',
    origin: job.origin ?? ''
  };

  const request = new Request(job.url || 'https://life.example/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(meta.cookie ? { cookie: meta.cookie } : {}),
      ...(meta.origin ? { origin: meta.origin } : {})
    },
    body: job.body
  });

  const events = [];

  async function publish(status) {
    if (typeof store.put === 'function') {
      await store.put(jobId, { ...meta, events: events.slice(), status });
      return;
    }
    // Memory-store tests that only stub append/finish.
    if (status === 'done' && typeof store.finish === 'function') {
      await store.finish(jobId, { events: events.slice() });
      return;
    }
    if (typeof store.append === 'function' && events.length) {
      await store.append(jobId, events.slice(events.length - 1));
    }
  }

  try {
    const response = await createHandler(handlerDeps)(request);
    if (!response?.body) {
      events.push({ type: 'error', code: 'anthropic_unavailable' });
      await publish('done');
      return true;
    }
    await drainSseIntoMemory(response.body, events, async () => {
      await publish('running');
    });
    const hasDone = events.some(event => event.type === 'done');
    if (!hasDone && !events.some(event => event.type === 'error')) {
      // Stream died mid-turn (platform kill / upstream drop). Mark it so the
      // client can show cut-off recovery instead of treating partial text as complete.
      events.push({ type: 'error', code: 'turn_incomplete' });
    }
    await publish('done');
    return true;
  } catch {
    events.push({ type: 'error', code: 'anthropic_unavailable' });
    await publish('done');
    return true;
  }
}

async function drainSseIntoMemory(body, events, onBatch) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let sinceFlush = 0;

  async function takeFrames({ flushTail = false } = {}) {
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      await pushFrame(frame);
    }
    // Platform kills often close the body mid-stream; still salvage a final
    // unterminated data: line so the last text delta is not silently dropped.
    if (flushTail && buffer.trim()) {
      await pushFrame(buffer);
      buffer = '';
    }
  }

  async function pushFrame(frame) {
    const line = frame.split('\n').find(candidate => candidate.startsWith('data:'));
    if (!line) return;
    try {
      events.push(JSON.parse(line.slice(5).trim()));
      sinceFlush += 1;
      if (sinceFlush >= FLUSH_EVERY_EVENTS) {
        sinceFlush = 0;
        await onBatch();
      }
    } catch {
      /* skip a malformed frame */
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    await takeFrames();
  }
  buffer += decoder.decode();
  await takeFrames({ flushTail: true });
  if (sinceFlush > 0) await onBatch();
}

/**
 * Always invoke chat-run on the same API host that received /api/chat.
 * Never use SITE_ORIGIN — that is GitHub Pages and has no Functions, which
 * silently failed the background kick and fell back to the 60s live stream.
 */
export function chatRunUrl(request, _env = {}) {
  return new URL('/api/chat-run', request.url);
}

export async function defaultInvokeChatBackground(request, jobId, env = {}, fetchImpl = fetch) {
  const response = await fetchImpl(chatRunUrl(request, env), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-chat-job-id': jobId,
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ jobId })
  });
  return response.status === 202 || response.ok;
}
