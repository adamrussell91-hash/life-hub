import { expect, test, type Page } from '@playwright/test';

/**
 * Station Rotation, the student flow on the invented reef lesson the mock seeds
 * (scripts/mock-api.ts seedStationRotation; tests/unit/helpers/rotation-fixture.mjs):
 * pretest → map → station → gate miss, reteach, pass → exit check → board link →
 * written gate → finale. Run with --trace off. Each width claims its own invented student.
 */

const URL = '/s/classes/class_2026_08sci/lessons/lesson_rotation_reef';
const SHOTS = process.env.ROTATION_SHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function noSideScroll(page: Page): Promise<void> {
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll).toBeLessThanOrEqual(inner);
}

async function answer(page: Page, scope: string, text: string | RegExp): Promise<void> {
  await page.locator(`${scope} .qz-choice`, { hasText: text }).first().click();
  await page.locator(`${scope} button`, { hasText: /^Check$/ }).first().click();
}

async function collect(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(page.locator('.rot-collect[data-locked="false"]')).toBeVisible();
  await page.getByRole('button', { name: '← Map' }).first().click();
}

for (const [width, initials] of [[1280, 'AB'], [390, 'CD']] as const) {
  test(`station rotation student flow at ${width}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL);
    await page.locator('.rot-gate-msg input').fill(initials);
    await page.locator('.rot-gate-msg button').click();

    // Pretest: one at a time, the right answer straight after, levels fill in.
    await expect(page.getByRole('heading', { name: 'Pretest', exact: true })).toBeVisible();
    await shot(page, `${width}-1-pretest`);
    for (let i = 0; i < 9; i++) {
      const order = await page.locator('.rot-pt-q .qz-choice__text').allTextContents();
      await answer(page, '.rot-pt-q', i === 0 ? /^Wrong$/ : /^Right$/);
      // The marked view keeps the same order and ticks or crosses the student's pick.
      await expect(page.locator('.rot-pt-q .qz-choice__text')).toHaveText(order);
      if (i === 0) await expect(page.locator('.rot-pt-q .qz-choice[data-state="wrong"]')).toHaveText('Wrong');
      await page.locator('.rot-pt-q button', { hasText: /Next question|See your map/ }).click();
    }

    // Map: a list in the same order at phone width.
    await expect(page.locator('.rot-map')).toBeVisible();
    await expect(page.locator('.rot-node[data-station="s3"] .rot-lvl')).toHaveText('Extend');
    await noSideScroll(page);
    await shot(page, `${width}-2-map`);

    // Station 1: exit check and collect.
    await page.locator('.rot-node[data-station="s1"]').click();
    await expect(page.getByRole('heading', { name: 'Reef words', exact: true })).toBeVisible();
    await expect(page.locator('.rot-levels button[aria-pressed="true"]')).toContainText('Core');
    await answer(page, '.rot-steps', 'Coral turning white');
    await collect(page);

    // Station 2: hinge gate miss, reteach and back-up, then pass.
    await page.locator('.rot-node[data-station="s2"]').click();
    await expect(page.locator('.rot-gated__inner')).toHaveAttribute('inert', '');
    await page.locator('.rot-sect--gate .rot-opt', { hasText: 'It dies off' }).click();
    await page.locator('.rot-sect--gate textarea').fill('the fish eat it');
    await page.locator('.rot-sect--gate button', { hasText: 'Check' }).click();
    await expect(page.locator('.rot-reteach')).toContainText('Thinks algae need fish');
    await shot(page, `${width}-3-reteach`);
    await page.locator('.rot-sect--gate .rot-opt', { hasText: 'grow and spread' }).click();
    await page.locator('.rot-sect--gate textarea').fill('nothing eats it now');
    await page.locator('.rot-sect--gate button', { hasText: 'Check' }).click();
    await expect(page.locator('.rot-gated')).toHaveAttribute('data-open', 'true');
    await expect(page.locator('.rot-gated__inner')).not.toHaveAttribute('inert', '');
    await answer(page, '.rot-gated', 'Less food and shelter');
    await collect(page);

    // Evidence board: link two cards with a teacher word.
    await page.locator('.rot-seg button', { hasText: 'Evidence board' }).click();
    if (width > 640) {
      await page.locator('.rot-ev[data-station="s1"]').click();
      await page.locator('.rot-ev[data-station="s2"]').click();
      await page.locator('.rot-linker button', { hasText: 'causes' }).click();
      await expect(page.locator('.rot-board__links text')).toHaveText('causes');
    } else {
      const add = page.locator('.rot-bl-add');
      await add.locator('select').nth(0).selectOption('s1');
      await add.locator('select').nth(1).selectOption('causes');
      await add.locator('select').nth(2).selectOption('s2');
      await add.getByRole('button', { name: 'Add link' }).click();
      await expect(page.locator('.rot-bl-link')).toContainText('Reef words causes The food web');
    }
    await expect(page.locator('.rot-saved')).toHaveText('Saved to your account');
    await noSideScroll(page);
    await shot(page, `${width}-4-board`);

    // Station 3: the written gate (local stand-in checker), then exit check.
    await page.locator('.rot-seg button', { hasText: 'Map' }).click();
    await page.locator('.rot-node[data-station="s3"]').click();
    // Hidden after-gate steps aren't built until the gate opens.
    await expect(page.getByText('Now link two of your techniques.')).toHaveCount(0);
    const box = page.locator('.rot-sect--gate textarea');
    await box.fill('Repetition in "nothing, nothing, nothing" makes the night empty.\n\nPersonification in "Its single eye turned and turned" makes it search.');
    await page.getByRole('button', { name: 'Check my writing' }).click();
    await expect(page.locator('.rot-sect--gate')).toContainText('Point 1');
    await expect(box).not.toHaveValue('');
    await page.waitForTimeout(20_500); // one check per 20 s
    await box.fill('Repetition in "nothing, nothing, nothing" shows isolation: the night is empty.\n\nPersonification in "Its single eye turned and turned" shows isolation as it searches alone.');
    await page.getByRole('button', { name: 'Check my writing' }).click();
    await expect(page.locator('.rot-gated')).toHaveAttribute('data-open', 'true');
    await shot(page, `${width}-5-written`);
    await answer(page, '.rot-gated', /^nothing$/);
    await collect(page);

    // Finale: lock, build with the board, debrief, growth.
    await page.locator('.rot-node[data-station="finale"]').click();
    await page.locator('.rot-lock .rot-opt', { hasText: 'Overfishing' }).click();
    await expect(page.locator('.rot-lock .rot-feedback')).toContainText('Not that one');
    await page.locator('.rot-lock .rot-opt', { hasText: 'too warm' }).click();
    await expect(page.locator('.rot-lock .rot-feedback')).toContainText('Open');
    await expect(page.locator('.rot-build-slot', { hasText: 'Your link' })).toContainText('Reef words causes The food web');
    await page.locator('.rot-panel textarea').first().fill('Cool the water first; the fish will come back.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.rot-saved').first()).toHaveText('Saved');
    await expect(page.locator('.rot-growth__row')).toHaveCount(3);
    await noSideScroll(page);
    await shot(page, `${width}-6-finale`);
  });
}
