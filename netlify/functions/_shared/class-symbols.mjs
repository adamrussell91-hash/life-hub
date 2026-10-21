/**
 * Anonymous class symbols, shared by the live student blocks (peer feedback,
 * brainstorm). Joining hands a device a free colour-and-shape symbol, tied to
 * a hash of a random token the device keeps. One create-only claim blob per
 * symbol, so two students joining at once never get the same one.
 */
import { randomInt } from 'node:crypto';

const STRONG = { type: 'json', consistency: 'strong' };

/** "colour-shape" pairs: six colours by six shapes. */
export const IDENTITIES = Array.from({ length: 36 }, (_, i) => `${i % 6}-${Math.floor(i / 6)}`);

export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Symbols already claimed this session. `claim(id)` gives the claim blob key. */
export async function claimedIds(store, claim) {
  const claims = await Promise.all(IDENTITIES.map((id) => store.get(claim(id), STRONG)));
  return IDENTITIES.filter((_, i) => claims[i]);
}

/**
 * Hands out a free symbol for this device's token, or finds the one it
 * already has. Returns null when every symbol is taken.
 */
export async function claimSymbol(store, { claim, token }, tokenHash) {
  const existing = await store.get(token(tokenHash), STRONG);
  if (existing) return existing.symbol;
  const taken = new Set(await claimedIds(store, claim));
  for (const id of shuffle(IDENTITIES.filter((x) => !taken.has(x)))) {
    await store.setJSON(claim(id), { token_hash: tokenHash }, { onlyIfNew: true });
    const won = await store.get(claim(id), STRONG);
    if (won?.token_hash === tokenHash) {
      await store.setJSON(token(tokenHash), { symbol: id }, { onlyIfNew: true });
      return id;
    }
  }
  return null;
}
