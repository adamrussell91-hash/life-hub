import { isChatJobId } from './chat-job-store.mjs';

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

  const request = new Request(job.url || 'https://life.example/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(job.cookie ? { cookie: job.cookie } : {}),
      ...(job.origin ? { origin: job.origin } : {})
    },
    body: job.body
  });

  try {
    const response = await createHandler(handlerDeps)(request);
    if (!response?.body) {
      await store.append(jobId, [{ type: 'error', code: 'anthropic_unavailable' }]);
      await store.finish(jobId);
      return true;
    }
    await drainSseIntoStore(response.body, store, jobId);
    await store.finish(jobId);
    return true;
  } catch {
    await store.append(jobId, [{ type: 'error', code: 'anthropic_unavailable' }]);
    await store.finish(jobId);
    return true;
  }
}

async function drainSseIntoStore(body, store, jobId) {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const line = frame.split('\n').find(candidate => candidate.startsWith('data:'));
      if (!line) continue;
      try {
        await store.append(jobId, [JSON.parse(line.slice(5).trim())]);
      } catch {
        /* skip a malformed frame */
      }
    }
  }
}

export function chatRunUrl(request, env = {}) {
  const base = env.URL || env.SITE_ORIGIN || request.url;
  return new URL('/api/chat-run', base);
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
