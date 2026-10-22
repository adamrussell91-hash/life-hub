import { withAppBase } from '@/app/base-path';
import { CLASS_SITE_ORIGIN, studentSiteOrigin } from '@/app/class-site';

/**
 * Shared student public-path helpers and a discreet Copy/Open control.
 * Lesson drafts stay gated: Publish creates the readable snapshot.
 */

export type PublicEntityKind = 'lesson' | 'unit' | 'class';

export function bareStudentPath(kind: PublicEntityKind, id: string): string {
  switch (kind) {
    case 'lesson':
      return `/s/lessons/${id}`;
    case 'unit':
      return `/s/units/${id}`;
    case 'class':
      return `/s/classes/${id}`;
  }
}

export function publicStudentPath(kind: PublicEntityKind, id: string): string {
  return withAppBase(bareStudentPath(kind, id));
}

/** URL handed to students. Never the umbrella host. */
export function absolutePublicUrl(kind: PublicEntityKind, id: string): string {
  return `${CLASS_SITE_ORIGIN}${bareStudentPath(kind, id)}`;
}

/**
 * URL a signed-in teacher opens to see the student page. The student host, so
 * the address bar never shows an umbrella URL that could be copied to a class.
 * Local dev keeps the dev origin.
 */
export function teacherPreviewUrl(kind: PublicEntityKind, id: string): string {
  const origin = studentSiteOrigin();
  if (origin === CLASS_SITE_ORIGIN) return absolutePublicUrl(kind, id);
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
  /** Extra per-class links, loaded when the popover opens. */
  loadClassLinks?: () => Promise<Array<{ label: string; url: string }>>;
}

/** Lesson link for one class: the quiz on it knows the class list without asking. */
export function classLessonUrl(lessonId: string, classId: string): string {
  return `${absolutePublicUrl('lesson', lessonId)}?class=${encodeURIComponent(classId)}`;
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

function copyButton(url: string, label: string): HTMLButtonElement {
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn--secondary';
  copyBtn.textContent = label;
  copyBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const resetLabel = () => {
      window.setTimeout(() => {
        copyBtn.textContent = label;
      }, 1500);
    };
    void import('../../design-kit/js/hub-feedback.js')
      .then(({ showCopyConfirm }) => showCopyConfirm(copyBtn, url))
      .then(() => {
        copyBtn.textContent = 'Copied';
        resetLabel();
      })
      .catch(() => {
        void copyText(url).then((ok) => {
          copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
          resetLabel();
        });
      });
  });
  return copyBtn;
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

    const copyBtn = copyButton(absolute, options.copyLabel ?? 'Copy');

    const openBtn = document.createElement('a');
    openBtn.className = 'btn btn--secondary';
    openBtn.href = absolute;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener noreferrer';
    openBtn.textContent = options.openLabel ?? 'Open';
    openBtn.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    actions.append(copyBtn, openBtn);
    popover.append(urlEl, actions);
    if (options.loadClassLinks) paintClassLinks(options.loadClassLinks);
  }

  function paintClassLinks(load: () => Promise<Array<{ label: string; url: string }>>): void {
    const section = document.createElement('div');
    section.className = 'public-link__classes';
    popover.append(section);
    void load()
      .then((links) => {
        if (!links.length) return;
        const lead = document.createElement('p');
        lead.className = 'public-link__lead';
        lead.textContent = 'Give students their class’s link, so the quiz asks for their initials:';
        section.append(lead);
        for (const link of links) {
          const row = document.createElement('div');
          row.className = 'public-link__class';
          const name = document.createElement('span');
          name.className = 'public-link__class-name';
          name.textContent = link.label;
          row.title = link.url;
          row.append(name, copyButton(link.url, 'Copy link'));
          section.append(row);
        }
      })
      .catch(() => {
        /* the plain link still works: the quiz asks which class */
      });
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
