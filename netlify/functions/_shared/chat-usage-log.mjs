// One log line per chat turn with its token usage and a rough US$ cost, so a
// real run can be costed from the Netlify function logs. Counts only, never
// message text.

// US$ per million tokens; web search is US$ per search.
const PRICES = {
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, search: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, search: 0.01 }
};

export function createTurnUsage() {
  return { rounds: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 };
}

export function addUsage(turn, event) {
  if (event?.type !== 'usage') return turn;
  turn.rounds += 1;
  for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'webSearches']) {
    turn[key] += Number(event[key]) || 0;
  }
  return turn;
}

export function estimateUsd(turn, model) {
  const p = PRICES[model];
  if (!p) return null;
  const usd =
    (turn.inputTokens * p.input +
      turn.outputTokens * p.output +
      turn.cacheReadTokens * p.cacheRead +
      turn.cacheWriteTokens * p.cacheWrite) /
      1e6 +
    turn.webSearches * p.search;
  return Math.round(usd * 10000) / 10000;
}

export function usageLogLine({ agent, model, turn }) {
  return JSON.stringify({ event: 'chat_usage', agent: agent ?? null, model, ...turn, est_usd: estimateUsd(turn, model) });
}
