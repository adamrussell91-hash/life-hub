import type { Money } from '@/types';

/** §2.7 — everything shows in AUD. AUD-native costs show exact cents;
 * converted costs show a rounded "≈ A$…" approximation. */
export function formatAud(money: Money | undefined | null): string {
  if (!money) return '';
  const exact = money.currency === 'AUD';
  const amount = exact
    ? money.aud.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(money.aud).toLocaleString('en-AU');
  return exact ? `A$${amount}` : `≈ A$${amount}`;
}
