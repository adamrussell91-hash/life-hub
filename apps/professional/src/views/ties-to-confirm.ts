/**
 * Ties to confirm — pending proposer:`ties` proposals (TIE-INFERENCE-BRIEF Phase 3).
 * Failure checks: V1, V4, W1, P4.
 */

import {
  acceptLinkProposal,
  declineLinkProposal,
  fetchTieProposals,
  type LinkProposal
} from '@/api/people-directory';
import { personRoute } from '@/app/router';

const ROLE_OPTIONS = [
  'colleague',
  'former_colleague',
  'mentor',
  'mentee',
  'academic_contact',
  'research_collaborator',
  'recruiter',
  'referee',
  'conference_contact',
  'introduction',
  'other'
] as const;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function personIdFromRef(ref: string | undefined | null): string | null {
  if (!ref || !ref.startsWith('shared:person:')) return null;
  return ref.slice('shared:person:'.length);
}

function pairRefs(proposal: LinkProposal): { a: string | null; b: string | null } {
  const link = proposal.proposed_link as
    | { source_ref?: string; target_ref?: string; role?: string | null }
    | undefined;
  return {
    a: personIdFromRef(link?.source_ref ?? null),
    b: personIdFromRef(link?.target_ref ?? null)
  };
}

function roleLabel(role: string | null | undefined): string {
  if (!role) return 'other';
  return role.replace(/_/g, ' ');
}

export interface TiesToConfirmOptions {
  isCurrent?: () => boolean;
}

/**
 * Render the Ties to confirm review list.
 * Header count and list length always come from the same response (V4).
 */
export async function renderTiesToConfirmView(
  canvas: HTMLElement,
  options: TiesToConfirmOptions = {}
): Promise<void> {
  canvas.replaceChildren();
  canvas.classList.add('ties-confirm');

  const header = el('header', 'ties-confirm__header');
  const title = el('h1', 'ties-confirm__title', 'Ties to confirm');
  const countEl = el('p', 'ties-confirm__count', 'Loading…');
  header.append(title, countEl);

  const list = el('div', 'ties-confirm__list');
  list.setAttribute('role', 'list');

  const empty = el('p', 'empty-state', 'No ties waiting.');
  empty.hidden = true;

  canvas.append(header, list, empty);

  let proposals: LinkProposal[] = [];
  let focusIndex = 0;
  const roleById = new Map<string, string>();

  function syncHeader(): void {
    const n = proposals.length;
    countEl.textContent = n === 1 ? '1 waiting' : `${n} waiting`;
  }

  function showEmptyOrList(): void {
    const has = proposals.length > 0;
    list.hidden = !has;
    empty.hidden = has;
    // V1: [hidden] must actually hide
    if (!has) {
      list.setAttribute('hidden', '');
      empty.removeAttribute('hidden');
    } else {
      empty.setAttribute('hidden', '');
      list.removeAttribute('hidden');
    }
  }

  async function reload(): Promise<void> {
    if (options.isCurrent && !options.isCurrent()) return;
    const res = await fetchTieProposals();
    proposals = res.proposals ?? [];
    // V4: count from same response as list
    if (typeof res.count === 'number' && res.count !== proposals.length) {
      // Prefer list length if parts disagree — never invent rows
      proposals = proposals.slice(0, res.count);
    }
    // Trust list length for display; API guarantees count === length
    syncHeader();
    renderRows();
    showEmptyOrList();
  }

  async function acceptAt(index: number): Promise<void> {
    const proposal = proposals[index];
    if (!proposal) return;
    const role = roleById.get(proposal.id);
    await acceptLinkProposal(proposal.id, role ? { role } : {});
    await reload();
    focusIndex = Math.min(index, Math.max(0, proposals.length - 1));
    focusRow(focusIndex);
  }

  async function declineAt(index: number): Promise<void> {
    const proposal = proposals[index];
    if (!proposal) return;
    await declineLinkProposal(proposal.id);
    await reload();
    focusIndex = Math.min(index, Math.max(0, proposals.length - 1));
    focusRow(focusIndex);
  }

  function focusRow(index: number): void {
    const row = list.querySelector(`[data-tie-index="${index}"]`) as HTMLElement | null;
    row?.focus();
  }

  function renderRows(): void {
    list.replaceChildren();
    proposals.forEach((proposal, index) => {
      const row = el('article', 'ties-confirm__row');
      row.setAttribute('role', 'listitem');
      row.tabIndex = 0;
      row.dataset.tieIndex = String(index);
      row.dataset.proposalId = proposal.id;

      const link = proposal.proposed_link as
        | {
            source_ref?: string;
            target_ref?: string;
            role?: string | null;
            metadata?: { pair_names?: string[]; evidence_count?: number };
          }
        | undefined;
      const { a, b } = pairRefs(proposal);
      const pairNames = link?.metadata?.pair_names;
      const names = el('div', 'ties-confirm__names');
      if (a) {
        const aLink = el('a', 'ties-confirm__name');
        aLink.href = personRoute(a);
        aLink.textContent = pairNames?.[0] || a;
        names.append(aLink);
      }
      names.append(document.createTextNode(' and '));
      if (b) {
        const bLink = el('a', 'ties-confirm__name');
        bLink.href = personRoute(b);
        bLink.textContent = pairNames?.[1] || b;
        names.append(bLink);
      }
      const role = link?.role ?? 'colleague';
      roleById.set(proposal.id, role);

      const roleWrap = el('label', 'ties-confirm__role');
      roleWrap.append(document.createTextNode('Role '));
      const select = el('select', 'ties-confirm__role-select') as HTMLSelectElement;
      for (const value of ROLE_OPTIONS) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = roleLabel(value);
        if (value === role) opt.selected = true;
        select.append(opt);
      }
      select.addEventListener('change', () => {
        roleById.set(proposal.id, select.value);
      });
      roleWrap.append(select);

      const reason = el('p', 'ties-confirm__reason', proposal.reason || '');

      const quotes = el('ul', 'ties-confirm__quotes');
      for (const src of (proposal.sources ?? []).slice(0, 2)) {
        const li = el('li', 'ties-confirm__quote');
        if (src.ref) {
          const qLink = el('a');
          qLink.href = `#/`; // record deep-links vary; excerpt is the substance
          qLink.textContent = src.excerpt || src.ref;
          qLink.title = src.ref;
          li.append(qLink);
        } else {
          li.textContent = src.excerpt;
        }
        quotes.append(li);
      }

      const actions = el('div', 'ties-confirm__actions');
      const acceptBtn = el('button', 'btn btn--primary', 'Accept') as HTMLButtonElement;
      acceptBtn.type = 'button';
      acceptBtn.addEventListener('click', () => void acceptAt(index).catch(alertError));
      const declineBtn = el('button', 'btn btn--ghost', 'Decline') as HTMLButtonElement;
      declineBtn.type = 'button';
      declineBtn.addEventListener('click', () => void declineAt(index).catch(alertError));
      actions.append(acceptBtn, declineBtn);

      const roleLine = el('p', 'ties-confirm__role-line', `${roleLabel(role)}?`);
      row.append(roleLine, names, roleWrap, reason, quotes, actions);

      row.addEventListener('focus', () => {
        focusIndex = index;
      });
      row.addEventListener('keydown', (event) => {
        if (event.key === 'a' || event.key === 'A') {
          event.preventDefault();
          void acceptAt(index).catch(alertError);
        } else if (event.key === 'd' || event.key === 'D') {
          event.preventDefault();
          void declineAt(index).catch(alertError);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          focusRow(Math.min(index + 1, proposals.length - 1));
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          focusRow(Math.max(index - 1, 0));
        }
      });

      list.append(row);
    });
  }

  function alertError(err: unknown): void {
    window.alert(err instanceof Error ? err.message : 'Request failed.');
  }

  try {
    await reload();
    if (proposals.length) focusRow(0);
  } catch (err) {
    countEl.textContent = 'Could not load ties.';
    empty.hidden = false;
    empty.textContent = err instanceof Error ? err.message : 'Could not load ties.';
    list.hidden = true;
  }
}
