import { randomUUID, createHash } from 'node:crypto';

const STATE = 'alchemy/v1/operator-budget';
const DAY = 86400000;
// Worst case for one check: the prompt byte cap and max_tokens. Real usage replaces it once known.
const INPUT = 16000, OUTPUT = 1600;
export const alchemyError = (status, code, message, retryAfterMs = 0) => Object.assign(new Error(message), { status, code, retryAfterMs });
const wait = ms => { const m = Math.ceil(ms / 60000); return ms < 60000 ? 'in under a minute' : m === 1 ? 'in about a minute' : `in about ${m} minutes`; };
// Say why Ann is waiting and for how long, not just that she is.
const REASONS = { timeout: 'Ann’s last check took too long', limited: 'The AI service asked Ann to slow down', failed: 'Ann’s last check failed' };
const cacheKey = key => 'alchemy/v1/results/' + createHash('sha256').update(key).digest('hex');

/** Strong conditional writes coordinate separate functions and browser sessions. */
export function createAlchemyBudget(store, { now = Date.now, timeZone = 'Australia/Sydney', configuration = '' } = {}) {
  const day = time => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(time);
  async function change(fn) {
    if (!store?.getWithMetadata || !store?.setJSON) throw alchemyError(503, 'alchemy_unconfigured', 'Alchemy Lab cannot safely coordinate requests.');
    for (let i = 0; i < 8; i++) {
      const row = await store.getWithMetadata(STATE, { type: 'json', consistency: 'strong' });
      const next = fn(structuredClone(row?.data ?? { attempts: [], failures: 0 }));
      const result = await store.setJSON(STATE, next, row ? { onlyIfMatch: row.etag } : { onlyIfNew: true });
      if (result?.modified) return next;
      if (result?.modified === undefined) throw alchemyError(503, 'alchemy_unconfigured', 'Alchemy Lab cannot safely coordinate requests.');
    }
    throw alchemyError(409, 'alchemy_busy', 'Ann is already checking a block. Try again shortly.', 30000);
  }
  return {
    async cached(key) { return (await store.get(cacheKey(key), { type: 'json', consistency: 'strong' }))?.result ?? null; },
    async remember(key,result) { await store.setJSON(cacheKey(key), { result }, { onlyIfNew: true }); },
    async reserve({ key, mode }) {
      const time = now(), id = randomUUID();
      await change(state => {
        state.attempts = state.attempts.filter(a => a.at > time - 2 * DAY);
        if (state.lease?.until > time) throw alchemyError(409, 'alchemy_busy', 'Ann is already checking a block. Try again shortly.', state.lease.until - time);
        if (state.permanent && state.configuration === configuration) throw alchemyError(503, 'alchemy_unconfigured', 'Alchemy Lab needs its service configuration checked.');
        if (state.configuration !== configuration) { state.permanent = false; state.configuration = configuration; }
        // A teacher's direct ask waits only for the provider or a short pause, not the background lockout.
        const until = mode === 'passive' ? state.cooldown : state.manualCooldown;
        if (until > time) throw alchemyError(429, 'alchemy_cooldown', `${REASONS[state.cooldownReason] || 'Ann is pausing'}. Try again ${wait(until - time)}.`, until - time);
        const same = state.attempts.filter(a => a.mode === mode), daily = same.filter(a => day(a.at) === day(time));
        if (mode === 'passive') {
          const hourly = same.filter(a => a.at > time - 3600000);
          if (hourly.length >= 6 || daily.length >= 24 || daily.reduce((n,a)=>n+a.input,0)+INPUT > 24*INPUT || daily.reduce((n,a)=>n+a.output,0)+OUTPUT > 24*OUTPUT) throw alchemyError(429, 'alchemy_budget', 'Ann has reached the background check allowance.', 3600000);
          const last = same.at(-1);
          if (last && last.at + 180000 > time) throw alchemyError(429, 'alchemy_cooldown', 'Ann will check again after the editing pause.', last.at+180000-time);
        } else if (same.filter(a => a.at > time - 600000).length >= 10 || daily.length >= 100) throw alchemyError(429, 'alchemy_budget', daily.length >= 100 ? 'Ann has reached today’s check allowance. Try again tomorrow.' : 'Ann has run ten checks in ten minutes. Try again in a few minutes.', 600000);
        const minute = state.attempts.filter(a=>a.at>time-60000);
        if (minute.length >= 4 || minute.reduce((n,a)=>n+a.input,0)+INPUT>4*INPUT || minute.reduce((n,a)=>n+a.output,0)+OUTPUT>4*OUTPUT) throw alchemyError(429,'alchemy_cooldown','Ann is pausing to stay within the service allowance. Try again in about a minute.',60000);
        state.attempts.push({ id, key, mode, at: time, input: INPUT, output: OUTPUT });
        state.lease = { id, key, until: time + 30000 };
        return state;
      });
      return { id, key, mode };
    },
    async finish(ticket, { result, error, usage } = {}) {
      if (!error && result !== undefined) await store.setJSON(cacheKey(ticket.key), { result }, { onlyIfNew: true });
      await change(state => {
        if (state.lease?.id !== ticket.id) return state;
        delete state.lease;
        if (error?.code === 'alchemy_timeout') {
          // A slow check is not a provider fault: a short pause, not the escalating lockout.
          state.cooldown = now() + 60000;
          state.manualCooldown = now() + 15000;
          state.cooldownReason = 'timeout';
        } else if (error) {
          state.failures = (state.failures || 0) + 1;
          state.permanent = (error.code === 'alchemy_upstream' && [400,401,402,403,404].includes(error.status)) || error.code === 'alchemy_unconfigured';
          state.cooldown = now() + Math.max(error.retryAfterMs || 0, state.failures >= 3 ? 1800000 : Math.min(3600000, 300000 * 2 ** (state.failures - 1)));
          state.manualCooldown = now() + Math.max(error.retryAfterMs || 0, 30000);
          state.cooldownReason = error.status === 429 ? 'limited' : 'failed';
        } else {
          state.failures = 0;
          delete state.cooldownReason;
          if (usage && Number.isFinite(usage.input) && Number.isFinite(usage.output) && usage.input >= 0 && usage.output >= 0 && usage.input <= INPUT && usage.output <= OUTPUT) {
            const attempt = state.attempts.find(a=>a.id===ticket.id);
            if (attempt) { attempt.input = usage.input; attempt.output = usage.output; }
          }
        }
        return state;
      });
    }
  };
}
