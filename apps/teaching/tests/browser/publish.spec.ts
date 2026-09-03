import { expect, test } from '@playwright/test';

test('teacher publishes lesson visible on student URL', async ({ page, context }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Passphrase').fill('teaching-hub-local');
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.getByRole('link', { name: 'Lessons' }).click();
  await expect(page.getByRole('heading', { name: 'Lessons', level: 1 })).toBeVisible();

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Memory, Identity and Ono' })
    .click();

  const titleField = page.getByLabel('Lesson title');
  await expect(titleField).toBeVisible();
  await titleField.fill('Memory, Identity and Ono');

  await page.getByRole('button', { name: /^publish$/i }).click();

  await expect(page.locator('[data-save-slot]')).toHaveText('Published');
  await expect(page.getByText('Published. Students can now view this lesson at:')).toHaveCount(0);

  const student = await context.newPage();
  await student.goto('/s/lessons/lesson_aotfw_008');

  await expect(student.locator('.lesson-hero__title')).toHaveText(
    'Memory, Identity and Ono'
  );
  await expect(student.getByText(/teacher only/i)).toHaveCount(0);
});
