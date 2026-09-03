export const DEFAULT_RESEARCH_KERNEL_URL = 'https://knowledge-hub-research.adamrussell91.workers.dev';
export const RESEARCH_KERNEL_URL_ENV = 'RESEARCH_KERNEL_URL';
export const RESEARCH_KERNEL_SECRET_ENV = 'RESEARCH_KERNEL_SHARED_SECRET';

export function knowledgeKernelUrl(env) {
  const configured = typeof env?.[RESEARCH_KERNEL_URL_ENV] === 'string'
    ? env[RESEARCH_KERNEL_URL_ENV].trim()
    : '';
  return (configured || DEFAULT_RESEARCH_KERNEL_URL).replace(/\/+$/, '');
}

export function knowledgeKernelSecret(env) {
  const secret = env?.[RESEARCH_KERNEL_SECRET_ENV];
  return typeof secret === 'string' && secret.length > 0 ? secret : '';
}

export function knowledgeKernelUnbound() {
  return Object.assign(new Error('Knowledge research kernel is not bound.'), {
    status: 503,
    code: 'knowledge_kernel_unbound'
  });
}

export async function knowledgeKernelFetch(path, {
  env,
  fetchImpl = fetch,
  method = 'GET',
  body,
  timeoutMs = 8_000
} = {}) {
  const secret = knowledgeKernelSecret(env);
  if (!secret) throw knowledgeKernelUnbound();
  const response = await fetchImpl(`${knowledgeKernelUrl(env)}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-research-kernel-secret': secret
    },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs)
  });
  return response;
}
