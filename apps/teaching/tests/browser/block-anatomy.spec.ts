import { expect, test, type Page } from '@playwright/test';

/**
 * Locks the shared lesson block anatomy (src/styles/block-anatomy.css) on a
 * page that renders every lesson block type with every author field filled
 * (block-anatomy.html, fixtures/every-block.ts).
 */

const ROLE_TYPE: Record<string, { size: string; weight: string; color: string }> = {
  'block-eyebrow': { size: '11px', weight: '700', color: 'rgb(107, 119, 136)' }, // --text-2xs, --muted
  'block-title': { size: '21px', weight: '700', color: 'rgb(23, 55, 94)' }, // --text-lg, --navy
  'block-subtitle': { size: '17px', weight: '700', color: 'rgb(23, 55, 94)' }, // --text-md, --navy
  'block-body': { size: '17px', weight: '400', color: 'rgb(19, 35, 58)' }, // --text-md, --ink
  'block-secondary': { size: '13px', weight: '400', color: 'rgb(107, 119, 136)' } // --text-sm, --muted
};
const THINKING_EYEBROW = 'rgb(168, 90, 12)'; // --high-sea-ink
const PLACEHOLDER = 'rgb(107, 119, 136)'; // --muted
/** State colours that carry meaning: an analogy that holds (sage) or breaks (danger), the limit of a bridge. */
const STATE_TONES = '.an-side--holds, .an-side--breaks, .an-plank--broken';

async function openAnatomy(page: Page): Promise<void> {
  await page.goto('/block-anatomy.html');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  await page.waitForTimeout(300);
}

test('every block uses one size, weight and colour per role', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openAnatomy(page);
  const problems = await page.evaluate(
    ({ roles, thinking, placeholder, tones }) => {
      const out: string[] = [];
      for (const [role, want] of Object.entries(roles)) {
        for (const node of document.querySelectorAll<HTMLElement>(`.${role}`)) {
          if (!node.getClientRects().length) continue;
          const style = getComputedStyle(node);
          const where = `${node.closest<HTMLElement>('[data-anatomy-type]')?.dataset.anatomyType} .${[...node.classList].join('.')}`;
          if (style.fontSize !== want.size || style.fontWeight !== want.weight) {
            out.push(`${where}: ${style.fontSize}/${style.fontWeight}, want ${want.size}/${want.weight}`);
          }
          if (node.closest('.block-on-fill') || node.closest(tones)) continue;
          let colour = want.color;
          if (node.classList.contains('block-eyebrow--thinking')) colour = thinking;
          if (node.classList.contains('block-body--placeholder')) colour = placeholder;
          if (style.color !== colour) out.push(`${where}: colour ${style.color}, want ${colour}`);
        }
      }
      return out;
    },
    { roles: ROLE_TYPE, thinking: THINKING_EYEBROW, placeholder: PLACEHOLDER, tones: STATE_TONES }
  );
  expect(problems).toEqual([]);
});

test('actions and pagers are the last slot in their block', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await openAnatomy(page);
  const problems = await page.evaluate(() => {
    const visible = (node: Element) => node.getClientRects().length > 0;
    const out: string[] = [];
    for (const row of document.querySelectorAll('.block-actions, .block-pager')) {
      if (!visible(row)) continue;
      for (let next = row.nextElementSibling; next; next = next.nextElementSibling) {
        // A pager may be followed only by the deck's actions row.
        if (row.classList.contains('block-pager') && next.classList.contains('block-actions')) continue;
        if (visible(next)) out.push(`.${[...row.classList].join('.')} is followed by .${[...next.classList].join('.')}`);
      }
    }
    return out;
  });
  expect(problems).toEqual([]);
});

test('every control is at least 44px tall at phone width, with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAnatomy(page);
  const result = await page.evaluate(() => {
    const small: string[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      '.lesson-blocks .block :is(button, .btn, .hub-pills__btn, .hub-list__chip, .hub-chip, summary, [role="tab"], select)'
    );
    for (const control of controls) {
      if (!control.getClientRects().length) continue;
      const box = control.getBoundingClientRect();
      if (box.height < 43.5) {
        small.push(`${control.closest<HTMLElement>('[data-anatomy-type]')?.dataset.anatomyType} .${[...control.classList].join('.')} ${Math.round(box.height)}px`);
      }
    }
    return { small, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(result.small).toEqual([]);
  expect(result.overflow).toBe(false);
});
