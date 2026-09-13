import { renderRelationshipTimeline as renderSharedTimeline } from '../../design-kit/js/relationship-timeline.js';
import type { TimelineEntry } from '@/domain/types';

/**
 * Thin TypeScript wrapper over the shared design-kit timeline renderer.
 * Visible behaviour and server ordering are unchanged from Slice 4.
 */
export function renderRelationshipTimeline(container: HTMLElement, timeline: TimelineEntry[]): void {
  renderSharedTimeline(container, timeline);
}
