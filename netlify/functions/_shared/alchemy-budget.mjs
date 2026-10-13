import { randomUUID, createHash } from 'node:crypto';

const STATE = 'alchemy/v1/operator-budget';
const DAY = 86400000;
export const alchemyError = (status, code, message, retryAfterMs = 0) => Object.assign(new Error(message), { status, code, retryAfterMs });
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
    async reserve({ key, mode }) {
      const time = now(), id = randomUUID();
      await change(state => {
        state.attempts = state.attempts.filter(a => a.at > time - 2 * DAY);
        if (state.lease?.until > time) throw alchemyError(409, 'alchemy_busy', 'Ann is already checking a block. Try again shortly.', state.lease.until - time);
        if (state.permanent && state.configuration === configuration) throw alchemyError(503, 'alchemy_unconfigured', 'Alchemy Lab needs its service configuration checked.');
        if (state.configuration !== configuration) { state.permanent = false; state.configuration = configuration; }
        if (state.cooldown > time) throw alchemyError(429, 'alchemy_cooldown', 'Ann is pausing before another check.', state.cooldown - time);
        const same = state.attempts.filter(a => a.mode === mode), daily = same.filter(a => day(a.at) === day(time));
        if (mode === 'passive') {
          const hourly = same.filter(a => a.at > time - 3600000);
          if (hourly.length >= 6 || daily.length >= 24 || daily.reduce((n,a)=>n+a.input,0)+8000 > 192000 || daily.reduce((n,a)=>n+a.output,0)+1200 > 28800) throw alchemyError(429, 'alchemy_budget', 'Ann has reached the background check allowance.', 3600000);
          const last = same.at(-1);
          if (last && last.at + 180000 > time) throw alchemyError(429, 'alchemy_cooldown', 'Ann will check again after the editing pause.', last.at+180000-time);
        } else if (same.filter(a => a.at > time - 600000).length >= 10 || daily.length >= 100) throw alchemyError(429, 'alchemy_budget', 'Ann has reached the interactive check allowance.', 600000);
        const minute = state.attempts.filter(a=>a.at>time-60000);
        if (minute.length >= 4 || minute.reduce((n,a)=>n+a.input,0)+8000>32000 || minute.reduce((n,a)=>n+a.output,0)+1200>4800) throw alchemyError(429,'alchemy_cooldown','Ann is pausing to stay within the service allowance.',60000);
        state.attempts.push({ id, key, mode, at: time, input: 8000, output: 1200 });
        state.lease = { id, key, until: time + 30000 };
        return state;
      });
      return { id, key, mode };
    },
    async finish(ticket, { result, error, usage } = {}) {
      await change(state => {
        if (state.lease?.id !== ticket.id) return state;
        delete state.lease;
        if (error) {
          state.failures = (state.failures || 0) + 1;
          state.permanent = [400,401,402,403].includes(error.status) || error.code === 'alchemy_unconfigured';
          state.cooldown = now() + Math.max(error.retryAfterMs || 0, state.failures >= 3 ? 1800000 : Math.min(3600000, 300000 * 2 ** (state.failures - 1)));
        } else {
          state.failures = 0;
          if (usage && Number.isFinite(usage.input) && Number.isFinite(usage.output) && usage.input >= 0 && usage.output >= 0 && usage.input <= 8000 && usage.output <= 1200) {
            const attempt = state.attempts.find(a=>a.id===ticket.id);
            if (attempt) { attempt.input = usage.input; attempt.output = usage.output; }
          }
        }
        return state;
      });
      if (!error && result !== undefined) await store.setJSON(cacheKey(ticket.key), { result }, { onlyIfNew: true });
    }
  };
}
