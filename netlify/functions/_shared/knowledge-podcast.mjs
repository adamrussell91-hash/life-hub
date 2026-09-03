import { knowledgeKernelFetch, knowledgeKernelSecret, knowledgeKernelUnbound } from './knowledge-kernel.mjs';
import { knowledgePresignGet, knowledgeR2Unbound } from './knowledge-r2.mjs';

export function findTurnAudioKey(episode, turnId) {
  const turns = Array.isArray(episode?.turns) ? episode.turns : [];
  const turn = turns.find(item => item?.id === turnId);
  return typeof turn?.audioKey === 'string' && turn.audioKey ? turn.audioKey : null;
}

export function podcastKernelPath(pathname) {
  const path = String(pathname ?? '').replace(/\/+$/, '') || '/';
  if (/\/podcast\/series\/start$/.test(path)) return { kernel: '/podcast/series/start', method: 'POST' };
  const seriesNext = path.match(/\/podcast\/series\/([^/]+)\/next$/);
  if (seriesNext) return { kernel: `/podcast/series/${seriesNext[1]}/next`, method: 'POST' };
  const seriesGet = path.match(/\/podcast\/series\/([^/]+)$/);
  if (seriesGet) return { kernel: `/podcast/series/${seriesGet[1]}`, method: 'GET' };
  const audio = path.match(/\/podcast\/([^/]+)\/audio\/([^/]+)$/);
  if (audio) return { audio: { episodeId: audio[1], turnId: audio[2] }, method: 'GET' };
  const interrupt = path.match(/\/podcast\/([^/]+)\/interrupt$/);
  if (interrupt) return { kernel: `/podcast/${interrupt[1]}/interrupt`, method: 'POST' };
  const answer = path.match(/\/podcast\/([^/]+)\/answer$/);
  if (answer) return { kernel: `/podcast/${answer[1]}/answer`, method: 'POST' };
  if (/\/podcast\/start$/.test(path)) return { kernel: '/podcast/start', method: 'POST' };
  if (/\/podcast$/.test(path)) return { kernel: '/podcast/index', method: 'GET' };
  const episode = path.match(/\/podcast\/([^/]+)$/);
  if (episode) return { kernel: `/podcast/${episode[1]}`, method: 'GET' };
  return null;
}

async function parseKernelPayload(response) {
  const text = await response.text();
  if (!text) return { raw: null, text: '' };
  try {
    return { raw: JSON.parse(text), text };
  } catch {
    return { raw: null, text };
  }
}

export async function runPodcastRequest({
  pathname,
  method,
  body,
  env,
  fetchImpl = fetch,
  signGet
}) {
  if (!knowledgeKernelSecret(env)) throw knowledgeKernelUnbound();
  const route = podcastKernelPath(pathname);
  if (!route || route.method !== method) {
    throw Object.assign(new Error('Not found'), { status: 404, code: 'not_found' });
  }

  if (route.audio) {
    const episodeRes = await knowledgeKernelFetch(`/podcast/${route.audio.episodeId}`, {
      env,
      fetchImpl,
      method: 'GET'
    });
    const episode = await parseKernelPayload(episodeRes);
    if (!episodeRes.ok) {
      throw Object.assign(new Error(typeof episode.raw?.error === 'string' ? episode.raw.error : 'Podcast failed'), {
        status: episodeRes.status || 502,
        code: 'podcast_failed'
      });
    }
    const audioKey = findTurnAudioKey(episode.raw, route.audio.turnId);
    if (!audioKey) throw Object.assign(new Error('Audio not found'), { status: 404, code: 'not_found' });
    try {
      const url = await knowledgePresignGet(env, { key: audioKey, signGet });
      return { url };
    } catch (error) {
      if (error?.code === 'knowledge_r2_unbound') throw knowledgeR2Unbound();
      throw error;
    }
  }

  const response = await knowledgeKernelFetch(route.kernel, {
    env,
    fetchImpl,
    method: route.method,
    ...(route.method === 'POST' ? { body: body ?? {} } : {}),
    timeoutMs: 26_000
  });
  const payload = await parseKernelPayload(response);
  if (!response.ok) {
    throw Object.assign(new Error(typeof payload.raw?.error === 'string' ? payload.raw.error : 'Podcast failed'), {
      status: response.status || 502,
      code: response.status === 503 ? 'knowledge_kernel_unbound' : 'podcast_failed'
    });
  }
  return payload.raw ?? {};
}
