/**
 * Shared student public-path helpers and a discreet Copy/Open control.
 * Lesson drafts stay gated: Publish creates the readable snapshot.
 */

export type PublicEntityKind = 'lesson' | 'unit' | 'class';

export function publicStudentPath(kind: PublicEntityKind, id: string): string {
  switch (kind) {
    case 'lesson':
      return `/s/lessons/${id}`;
    case 'unit':
      return `/s/units/${id}`;
    case 'class':
      return `/s/classes/${id}`;
  }
}

export function absolutePublicUrl(kind: PublicEntityKind, id: string, origin = location.origin): string {
  return `${origin}${publicStudentPath(kind, id)}`;
}

export interface PublicLinkControlOptions {
  kind: PublicEntityKind;
  id: string;
  /** When false, the control stays inert until Publish creates a snapshot. */
  published: boolean;
  /** Optional label override for the trigger button. */
  label?: string;
  className?: string;
  /** Labelled secondary button instead of the compact icon trigger. */
  trigger?: 'icon' | 'labelled';
  lead?: string;
  copyLabel?: string;
  openLabel?: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

let activeClose: (() => void) | null = null;

/**
 * Compact ghost control. Nested inside cards — callers must stopPropagation
 * on the host so whole-card open does not fire.
 */
export function mountPublicLinkControl(
  host: HTMLElement,
  options: PublicLinkControlOptions
): { dispose: () => void } {
  host.replaceChildren();
  host.classList.add('public-link');
  if (options.className) host.classList.add(options.className);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.disabled = !options.published;
  if (options.trigger === 'labelled') {
    trigger.className = 'btn btn--secondary public-link__trigger public-link__trigger--labelled';
    trigger.textContent = options.label ?? 'Share';
  } else {
    trigger.className = 'btn btn--ghost public-link__trigger';
    trigger.setAttribute('aria-label', options.label ?? 'Public link');
    trigger.title = options.label ?? 'Public link';
    trigger.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"/></svg>';
  }

  const popover = document.createElement('div');
  popover.className = 'public-link__popover';
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Public student link');

  function paintPopover(): void {
    popover.replaceChildren();
    if (!options.published) return;

    const path = publicStudentPath(options.kind, options.id);
    const absolute = absolutePublicUrl(options.kind, options.id);
    if (options.lead) {
      const lead = document.createElement('p');
      lead.className = 'public-link__lead';
      lead.textContent = options.lead;
      popover.append(lead);
    }
    const urlEl = document.createElement('p');
    urlEl.className = 'public-link__url';
    urlEl.textContent = absolute;

    const actions = document.createElement('div');
    actions.className = 'public-link__actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn--secondary';
    copyBtn.textContent = options.copyLabel ?? 'Copy';
    copyBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      void copyText(absolute).then((ok) => {
        copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
        window.setTimeout(() => {
          copyBtn.textContent = options.copyLabel ?? 'Copy';
        }, 1500);
      });
    });

    const openBtn = document.createElement('a');
    openBtn.className = 'btn btn--secondary';
    openBtn.href = path;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener noreferrer';
    openBtn.textContent = options.openLabel ?? 'Open';
    openBtn.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    actions.append(copyBtn, openBtn);
    popover.append(urlEl, actions);
  }

  function setOpen(open: boolean): void {
    if (open) {
      if (activeClose && activeClose !== closeSelf) activeClose();
      activeClose = closeSelf;
      paintPopover();
    } else if (activeClose === closeSelf) {
      activeClose = null;
    }
    popover.hidden = !open;
    host.classList.toggle('public-link--open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeSelf(): void {
    setOpen(false);
  }

  const onTrigger = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (!options.published) return;
    setOpen(popover.hidden);
  };

  const onDoc = (event: MouseEvent): void => {
    if (popover.hidden) return;
    const target = event.target as Node | null;
    if (target && host.contains(target)) return;
    setOpen(false);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || popover.hidden) return;
    setOpen(false);
  };

  const stop = (event: Event): void => {
    event.stopPropagation();
  };

  trigger.addEventListener('click', onTrigger);
  host.addEventListener('click', stop);
  host.addEventListener('keydown', stop);
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onKey);

  host.append(trigger, popover);

  return {
    dispose: () => {
      if (activeClose === closeSelf) activeClose = null;
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
      host.replaceChildren();
    }
  };
}
