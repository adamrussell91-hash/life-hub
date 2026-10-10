import type { JournalDocument } from '@/api/journal';
import {
  createJournalShareLink,
  revokeJournalShareLink,
  type JournalShareScope,
} from '@/api/journal-share';
import type { JournalLeg, JournalMoment } from '@/journal/types';
import { attachVisualViewportInset } from '../../design-kit/js/visual-viewport.js';

export interface OpenJournalShareSheetOptions {
  tripId: string;
  journal: JournalDocument;
  anchor: HTMLElement;
  existingUrl?: string | null;
  onClose?: () => void;
  onLinkChange?: (url: string | null) => void;
}

export function isJournalShareScopeValid(scope: JournalShareScope): boolean {
  return (scope.moment_ids?.length ?? 0) > 0 || (scope.leg_ids?.length ?? 0) > 0;
}

function liveMoments(journal: JournalDocument): JournalMoment[] {
  return journal.moments.filter((m) => m.lifecycle === 'live');
}

function liveLegs(journal: JournalDocument): JournalLeg[] {
  return journal.legs.filter((l) => l.lifecycle === 'live');
}

export function openJournalShareSheet(options: OpenJournalShareSheetOptions): { destroy(): void } {
  attachVisualViewportInset();
  let destroyed = false;
  let currentUrl = options.existingUrl ?? '';
  const selectedMoments = new Set<string>();
  const selectedLegs = new Set<string>();

  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet addform journal-share-sheet hub-morph-dialog';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Share journal moments');

  const form = document.createElement('form');
  form.className = 'addform__form compose';
  const scroll = document.createElement('div');
  scroll.className = 'addform__scroll';

  const heading = document.createElement('h3');
  heading.textContent = 'Share selected moments';

  const intro = document.createElement('p');
  intro.className = 'journal-sheet__hint';
  intro.textContent =
    'Choose legs or individual moments. Nothing is selected by default. Shared links include display photos only — not originals, GPS, or booking details.';

  const linkBox = document.createElement('p');
  linkBox.className = 'journal-share-sheet__link';
  linkBox.textContent = currentUrl ? currentUrl : 'No link yet.';

  const list = document.createElement('div');
  list.className = 'journal-share-sheet__list';

  for (const leg of liveLegs(options.journal)) {
    const legRow = document.createElement('label');
    legRow.className = 'journal-share-sheet__leg';
    const legCheck = document.createElement('input');
    legCheck.type = 'checkbox';
    legCheck.name = 'leg';
    legCheck.value = leg.id;
    legCheck.addEventListener('change', () => {
      if (legCheck.checked) selectedLegs.add(leg.id);
      else selectedLegs.delete(leg.id);
      syncCreateState();
    });
    const legTitle = document.createElement('span');
    legTitle.textContent = leg.destination;
    legRow.append(legCheck, legTitle);
    list.append(legRow);

    const moments = liveMoments(options.journal).filter((m) => m.leg_id === leg.id);
    for (const moment of moments) {
      const row = document.createElement('label');
      row.className = 'journal-share-sheet__moment';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.name = 'moment';
      check.value = moment.id;
      check.addEventListener('change', () => {
        if (check.checked) selectedMoments.add(moment.id);
        else selectedMoments.delete(moment.id);
        syncCreateState();
      });
      const label = document.createElement('span');
      const place = moment.place?.name?.trim();
      const snippet = moment.text?.trim().slice(0, 48) || place || 'Moment';
      label.textContent = `${moment.local_date}${moment.local_time ? ` ${moment.local_time}` : ''} — ${snippet}`;
      row.append(check, label);
      list.append(row);
    }
  }

  const actions = document.createElement('div');
  actions.className = 'addform__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn--secondary';
  cancelBtn.textContent = 'Cancel';
  const createBtn = document.createElement('button');
  createBtn.type = 'submit';
  createBtn.className = 'btn btn--primary';
  createBtn.textContent = 'Create link';
  createBtn.disabled = true;
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn--secondary';
  copyBtn.textContent = 'Copy link';
  copyBtn.disabled = !currentUrl;
  const revokeBtn = document.createElement('button');
  revokeBtn.type = 'button';
  revokeBtn.className = 'btn btn--ghost';
  revokeBtn.textContent = 'Turn link off';
  revokeBtn.disabled = !currentUrl;

  function scope(): JournalShareScope {
    return {
      moment_ids: [...selectedMoments],
      leg_ids: [...selectedLegs],
    };
  }

  function syncCreateState(): void {
    createBtn.disabled = !isJournalShareScopeValid(scope());
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    back.remove();
    sheet.remove();
    options.onClose?.();
  }

  cancelBtn.addEventListener('click', destroy);
  back.addEventListener('click', (ev) => {
    if (ev.target === back) destroy();
  });

  copyBtn.addEventListener('click', () => {
    if (currentUrl) void navigator.clipboard?.writeText(currentUrl);
  });

  revokeBtn.addEventListener('click', () => {
    void (async () => {
      await revokeJournalShareLink(options.tripId);
      currentUrl = '';
      linkBox.textContent = 'This link has been turned off.';
      copyBtn.disabled = true;
      revokeBtn.disabled = true;
      options.onLinkChange?.(null);
    })();
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const nextScope = scope();
    if (!isJournalShareScopeValid(nextScope)) return;
    void (async () => {
      const { url } = await createJournalShareLink(options.tripId, nextScope);
      currentUrl = url;
      linkBox.textContent = url;
      copyBtn.disabled = false;
      revokeBtn.disabled = false;
      options.onLinkChange?.(url);
    })();
  });

  actions.append(cancelBtn, createBtn, copyBtn, revokeBtn);
  scroll.append(heading, intro, linkBox, list);
  form.append(scroll, actions);
  sheet.append(form);
  options.anchor.append(back, sheet);

  return { destroy };
}
