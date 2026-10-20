/**
 * The Add person panel: "Paste from LinkedIn" at the top, then "or type it
 * in" with the quick form. A read paste swaps both for the review card.
 * Esc and the close icon both close it.
 */

import { mountAddPersonForm, type AddPersonResult } from '@/components/add-person-form';
import {
  mountLinkedInPaste,
  renderLinkedInReview,
  saveLinkedInSelection
} from '@/components/linkedin-review';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface AddPersonPanelOptions {
  crest: (orgRef: string | null, orgName: string) => HTMLElement;
  onAdded: (result: AddPersonResult) => void;
  onClose: () => void;
}

export function mountAddPersonPanel(host: HTMLElement, options: AddPersonPanelOptions): {
  open: () => void;
  reset: () => void;
} {
  const panel = el('section', 'add-person-panel');
  panel.setAttribute('aria-label', 'Add person');
  const head = el('div', 'add-person-panel__head');
  head.append(el('h2', 'add-person-panel__title', 'Add person'));
  const close = el('button', 'person-icon-btn add-person-panel__close', '✕') as HTMLButtonElement;
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => options.onClose());
  head.append(close);

  const pasteHost = el('div', 'add-person-panel__paste');
  const divider = el('p', 'add-person-panel__or', 'or type it in');
  const formHost = el('div', 'add-person-panel__form');
  const reviewHost = el('div', 'add-person-panel__review');
  reviewHost.hidden = true;
  panel.append(head, pasteHost, divider, formHost, reviewHost);
  host.append(panel);

  function showEntry(): void {
    pasteHost.hidden = false;
    divider.hidden = false;
    formHost.hidden = false;
    reviewHost.hidden = true;
    reviewHost.replaceChildren();
  }

  const form = mountAddPersonForm(formHost, {
    onCreated: (result) => options.onAdded(result),
    onCancel: () => options.onClose()
  });

  const paste = mountLinkedInPaste(pasteHost, {
    onParsed: (result) => {
      pasteHost.hidden = true;
      divider.hidden = true;
      formHost.hidden = true;
      reviewHost.hidden = false;
      renderLinkedInReview(reviewHost, {
        result,
        existing: null,
        crest: options.crest,
        onBack: showEntry,
        onSave: async (selection) => {
          const saved = await saveLinkedInSelection(selection, { personRef: null });
          options.onAdded({
            person: saved.person!,
            warnings: saved.failed.map((label) => `${label} didn’t save.`),
            failed: saved.failed,
            role: saved.role
          });
        }
      });
    }
  });

  return {
    open: () => paste.focus(),
    reset: () => {
      form.reset();
      paste.reset();
      showEntry();
    }
  };
}
