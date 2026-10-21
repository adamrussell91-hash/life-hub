import { expect, test } from '@playwright/test';

test('Kaplan stays attached through authoring, publication and removal', async ({ page, context }) => {
  const id = 'lesson_aotfw_008';
  const auth = await page.request.post('/api/auth', { data: { passphrase: 'teaching-hub-local' } });
  expect(auth.ok()).toBeTruthy();
  const original = await (await page.request.get(`/api/lessons/${id}`)).json();
  const stamp = '2026-01-01T00:00:00.000Z';
  const block = {
    id: 'kaplan_question', type: 'block', block_type: 'question_set', variant: 'medium',
    visibility: 'student_teacher', layout: {}, print: {}, settings: {},
    created_at: stamp, updated_at: stamp, schema_version: 1,
    content: { title: 'Visual imagery and reconciliation', questions: [{
      id: 'kaplan_q1', kind: 'short_answer', response_space: 'medium',
      prompt: 'How does the poet explore reconciliation through visual imagery in The Remedy of Butterflies?'
    }] }
  };
  const put = await page.request.put(`/api/lessons/${id}`, {
    data: { ...original.data, title: 'Reconciliation', blocks: [block] }
  });
  expect(put.ok()).toBeTruthy();
  await page.goto(`/lessons/${id}`);
  const row = page.locator('.lesson-page__block[data-block-id="kaplan_question"]');
  await row.locator('.lesson-page__block-menu').click();
  await page.locator('.hub-action-menu [data-block-action="edit"]').click();
  await expect(row.locator('.kaplan-author')).toBeVisible();
  for (const lens of ['Multiple Perspectives', 'Patterns', 'Ethics']) {
    await row.getByLabel('Block options', { exact: true }).click();
    await row.getByRole('button', { name: 'Add lens…', exact: true }).click();
    await row.locator('.kaplan-lens-choice').filter({ hasText: lens }).click();
    await expect(row.getByLabel('What should students think about?')).toHaveValue('reconciliation');
    await row.getByRole('button', { name: 'Add lens', exact: true }).click();
  }
  await row.getByRole('button', { name: 'Edit Multiple Perspectives lens', exact: true }).click();
  await row.getByRole('button', { name: 'Review the steps', exact: true }).click();
  await expect(row.getByLabel('Student instruction')).toBeVisible();
  await expect(row.locator('.block-editor__fields')).toBeHidden();
  await expect(row.locator('.kaplan-setup > .kaplan-field textarea')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('teacher-setup.png'), fullPage: true });
  await row.getByRole('button', { name: 'Setup', exact: true }).click();
  await row.getByRole('button', { name: 'Save lens', exact: true }).click();
  await expect.poll(async () => {
    const result = await (await page.request.get(`/api/lessons/${id}`)).json();
    return result.data.blocks[0].qualifiers?.length;
  }).toBe(3);
  await page.reload();
  await expect(row.locator('.kaplan-chip')).toHaveCount(3);
  await page.getByRole('button', { name: 'Lesson options', exact: true }).click();
  await page.locator('.context-bar__publish').click();
  await expect(page.locator('[data-save-slot]')).toHaveText('Published');

  const student = await context.newPage();
  await student.goto(`/s/lessons/${id}`);
  await expect(student.locator('.kaplan-chip')).toHaveCount(3);
  await expect(student.locator('.kaplan-chip svg')).toHaveCount(3);
  await student.getByRole('button', { name: 'Multiple Perspectives', exact: true }).click();
  await expect(student.locator('.kaplan-workspace__step-title')).toHaveText('Choose one detail');
  await student.getByLabel('Your thinking', { exact: true }).fill('One visual image from my copy.');
  await student.getByRole('button', { name: 'Next step', exact: true }).click();
  await expect(student.locator('.kaplan-workspace__step-title')).toHaveText('Consider two readings');
  await student.screenshot({ path: test.info().outputPath('student-steps.png'), fullPage: true });
  await student.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(student.getByLabel('Your thinking', { exact: true })).toHaveValue('One visual image from my copy.');
  await student.reload();
  await student.getByRole('button', { name: 'Multiple Perspectives', exact: true }).click();
  await expect(student.getByLabel('Your thinking', { exact: true })).toHaveValue('One visual image from my copy.');
  await student.setViewportSize({ width: 390, height: 844 });
  expect(await student.locator('body').evaluate((e) => e.scrollWidth <= innerWidth)).toBeTruthy();
  await student.screenshot({ path: test.info().outputPath('student-mobile.png'), fullPage: true });

  await row.locator('.lesson-page__block-menu').click();
  await page.locator('.hub-action-menu [data-block-action="edit"]').click();
  await row.getByRole('button', { name: 'Edit Multiple Perspectives lens', exact: true }).click();
  await row.getByRole('button', { name: 'Remove lens', exact: true }).click();
  await row.getByLabel('Question 1 prompt').fill('A revised question that remains after qualifier removal.');
  await expect.poll(async () => {
    const result = await (await page.request.get(`/api/lessons/${id}`)).json();
    return result.data.blocks[0].qualifiers?.map((q: { lens: string }) => q.lens);
  }).toEqual(['patterns', 'ethics']);
  await page.reload();
  await page.getByRole('button', { name: 'Lesson options', exact: true }).click();
  await page.locator('.context-bar__publish').click();
  await expect(page.locator('[data-save-slot]')).toHaveText('Published');
  await student.reload();
  await expect(student.getByRole('button', { name: 'Multiple Perspectives', exact: true })).toHaveCount(0);
  await expect(student.locator('.kaplan-chip')).toHaveCount(2);
  await expect(student.locator('.block-question-set__prompt')).toHaveText('A revised question that remains after qualifier removal.');
});
