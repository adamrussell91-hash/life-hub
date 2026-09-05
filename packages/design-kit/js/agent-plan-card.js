/**
 * Updating multi-step plan status surface (Tool UI plan pattern, Cotton Glass chrome).
 */

import { createStepIndicator } from './hub-surfaces.js';

/**
 * @param {ParentNode & { createElement?: typeof document.createElement }} root
 * @param {{
 *   id?: string,
 *   heading?: string,
 *   steps?: string[],
 *   current?: number
 * }} options
 */
export function createAgentPlanCard(root, options = {}) {
  const create =
    root.createElement?.bind(root) ?? globalThis.document.createElement.bind(globalThis.document);
  const card = create('section');
  card.className = 'agent-plan-card';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  if (options.id) card.dataset.planId = String(options.id);

  const eyebrow = create('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = 'Plan';
  card.append(eyebrow);

  const heading = create('h2');
  heading.className = 'agent-plan-card__title';
  heading.textContent = options.heading || 'Working';
  card.append(heading);

  const stepsHost = create('div');
  stepsHost.className = 'agent-plan-card__steps';
  card.append(stepsHost);

  const paint = (next = {}) => {
    if (typeof next.heading === 'string' && next.heading.trim()) {
      heading.textContent = next.heading.trim();
    }
    const steps = Array.isArray(next.steps) ? next.steps : options.steps ?? [];
    const current = Number.isFinite(next.current) ? Number(next.current) : options.current ?? 0;
    stepsHost.replaceChildren();
    const { el } = createStepIndicator({
      root,
      steps: steps.map(step => String(step)),
      current
    });
    stepsHost.append(el);
    card.setAttribute(
      'aria-label',
      `${heading.textContent}: step ${Math.min(current + 1, Math.max(steps.length, 1))} of ${Math.max(steps.length, 1)}`
    );
  };

  paint({
    heading: options.heading,
    steps: options.steps,
    current: options.current
  });

  return { card, update: paint };
}
