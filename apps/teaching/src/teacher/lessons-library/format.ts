import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import type { LessonPublishBadge } from './types';

export function formatLessonCount(total: number, shown: number, filtered: boolean): string {
  const noun = total === 1 ? 'lesson' : 'lessons';
  if (!filtered) return `${total} ${noun}`;
  return `${total} ${noun} · showing ${shown} (filtered)`;
}

export function formatRelativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const delta = now.getTime() - then.getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatDisplayDate(then);
}

export function badgeLabel(badge: LessonPublishBadge): string {
  switch (badge) {
    case 'published':
      return 'Published';
    case 'draft':
      return 'Draft';
    case 'needs_review':
      return 'Needs review';
    case 'archived':
      return 'Archived';
  }
}

export function groupMeta(published: number, draft: number, extra?: string[]): string {
  const parts = [`${published + draft} lessons`, `${published} published`, `${draft} draft`];
  if (extra) parts.push(...extra);
  return parts.join(' · ');
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
