// 00:17 AEST. No path — scheduled functions cannot declare one.
// Kick the background HTTP tick; the schedule itself caps at 30s.
export const config = { schedule: '17 14 * * *' };

export function createAiJobsScheduledHandler(deps = {}) {
  return async function aiJobsScheduledHandler() {
    const env = deps.env ?? process.env;
    const fetchImpl = deps.fetchImpl ?? fetch;
    const base = env.URL || env.DEPLOY_URL;
    if (!base) {
      throw new Error('Scheduled AI jobs tick is missing URL');
    }
    const response = await fetchImpl(new URL('/api/ai/jobs/tick', base), {
      method: 'POST',
      headers: { 'x-nf-event': 'schedule' }
    });
    if (!response.ok) {
      throw new Error(`Scheduled AI jobs tick HTTP ${response.status}`);
    }
  };
}

export default createAiJobsScheduledHandler();
