import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createQuestionSetEditor } from '@/blocks/editors';
import { formatsFor, withFormat } from '@/blocks/formats/registry';
import { frameStart, listWords } from '@/blocks/formats/sentence-model';
import { renderBlock } from '@/blocks/render';
import { storageKey } from '@/blocks/learning-activity';
import { BlockSchema, type Block } from '@/schemas/block';
import { pickKitOption } from './kit-filter';

type QuestionSet = Extract<Block, { block_type: 'question_set' }>;
type Format = 'sentence_combining' | 'appositive' | 'sentence_expansion' | 'note_to_topic';

/** Invented examples about an invented novel. */
function sentenceSet(format: Format, count = 4): QuestionSet {
  const block = withFormat(createBlock('question_set', 'sent') as QuestionSet, format);
  block.content.questions = Array.from({ length: count }, (_, i) => ({
    id: `q${i + 1}`,
    prompt: '',
    kind: 'short_answer' as const,
    response_space: 'medium' as const,
    kernels: format === 'note_to_topic'
      ? ['lighthouse keeper', 'alone for years', 'keeps the lamp lit']
      : format === 'sentence_combining'
        ? [`The keeper climbs the tower ${i + 1}.`, 'The storm is coming.']
        : [`The keeper climbs the tower ${i + 1}.`],
    ...(format === 'sentence_combining' ? { conjunction: 'although' } : {}),
    ...(format === 'sentence_expansion' ? { question_words: ['who', 'when', 'why'] as ('who' | 'when' | 'why')[] } : {}),
    model_answer: 'Although the storm is coming, the keeper climbs the tower to light the lamp.'
  }));
  return block;
}

const items = (view: HTMLElement) => [...view.querySelectorAll<HTMLElement>('.block-question-set__question')];
const type = (area: HTMLTextAreaElement, value: string) => { area.value = value; area.dispatchEvent(new Event('input', { bubbles: true })); };

beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('sentence formats in the registry', () => {
  it('lists the four formats with hints that point at the unit’s text', () => {
    const entries = formatsFor('question_set').filter((f) => ['sentence_combining', 'appositive', 'sentence_expansion', 'note_to_topic'].includes(f.id));
    expect(entries).toHaveLength(4);
    for (const entry of entries) expect(entry.hint).toMatch(/text/);
  });
  it('lists question words and opens frames ready to type on', () => {
    expect(listWords(['who', 'when', 'why'])).toBe('who, when and why');
    expect(listWords(['how'])).toBe('how');
    expect(frameStart('Although the storm …')).toBe('Although the storm ');
    expect(frameStart('As the keeper, ___')).toBe('As the keeper, ___');
  });
});

describe.each(['sentence_combining', 'appositive', 'sentence_expansion', 'note_to_topic'] as const)('%s student view', (format) => {
  it('fades from a worked example to a frame to a blank box', () => {
    const view = renderBlock(sentenceSet(format), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    const [first, second, third, fourth] = items(view);
    expect(first!.dataset.stage).toBe('model');
    expect(first!.querySelector('.block-sentence__worked')!.textContent).toContain('Worked example');
    expect(first!.querySelector('.block-sentence__worked')!.textContent).toContain('the keeper climbs the tower to light the lamp');
    expect(first!.querySelector('textarea')).toBeNull();
    expect(second!.dataset.stage).toBe('frame');
    expect(second!.querySelector<HTMLTextAreaElement>('textarea')!.value).toMatch(/^Although the storm /);
    expect(third!.dataset.stage).toBe('frame');
    expect(fourth!.dataset.stage).toBe('independent');
    expect(fourth!.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
  });
});

describe('sentence formats: material by format', () => {
  it('stacks kernels and names the joining word for combining', () => {
    const view = renderBlock(sentenceSet('sentence_combining'), 'student', { lessonId: 'lesson' });
    expect(view.querySelectorAll('.block-question-set__question')[1]!.querySelectorAll('.block-sentence__kernel')).toHaveLength(2);
    expect(view.textContent).toContain('Join them into one sentence. Use ‘although’.');
  });
  it('shows chips for the chosen question words in expansion', () => {
    const view = renderBlock(sentenceSet('sentence_expansion'), 'student', { lessonId: 'lesson' });
    const chips = [...items(view)[3]!.querySelectorAll('.block-sentence__chip')].map((c) => c.textContent);
    expect(chips).toEqual(['who', 'when', 'why']);
    expect(view.textContent).toContain('Add who, when and why.');
  });
  it('asks for an appositive and a topic sentence', () => {
    expect(renderBlock(sentenceSet('appositive'), 'student').textContent).toContain('Add an appositive: a phrase that renames the noun.');
    const notes = renderBlock(sentenceSet('note_to_topic'), 'student');
    expect(notes.textContent).toContain('Turn the notes into one topic sentence.');
    expect(notes.querySelectorAll('.block-question-set__question')[3]!.querySelectorAll('.block-sentence__note')).toHaveLength(3);
  });
  it('keeps every item independent with fading off, and one item alone is independent', () => {
    const off = sentenceSet('appositive');
    off.content.sentence = { fade: false };
    expect(items(renderBlock(off, 'student')).map((li) => li.dataset.stage)).toEqual(['independent', 'independent', 'independent', 'independent']);
    expect(items(renderBlock(sentenceSet('appositive', 1), 'student')).map((li) => li.dataset.stage)).toEqual(['independent']);
  });
});

describe('sentence formats: writing, checks and saving', () => {
  it('opens the model only once the student has written, and remembers it separately', () => {
    const block = sentenceSet('sentence_combining');
    const view = renderBlock(block, 'student', { lessonId: 'lesson' });
    document.body.append(view);
    const last = items(view)[3]!;
    const button = last.querySelector<HTMLButtonElement>('.block-question-set__model-btn')!;
    const model = last.querySelector<HTMLElement>('.block-question-set__model')!;
    expect(button.classList.contains('block-self-check__btn')).toBe(true);
    expect(button.disabled).toBe(true);
    expect(model.hidden).toBe(true);
    type(last.querySelector('textarea')!, 'The keeper climbs the tower although the storm is coming.');
    expect(button.disabled).toBe(false);
    button.click();
    expect(model.hidden).toBe(false);
    expect(JSON.parse(localStorage.getItem(`${storageKey('lesson', block.id)}.sentence-seen`)!)).toEqual({ q4: true });

    // A frame item counts as written only once it differs from the frame.
    const frameItem = items(view)[1]!;
    const frameButton = frameItem.querySelector<HTMLButtonElement>('.block-question-set__model-btn')!;
    expect(frameButton.disabled).toBe(true);
    type(frameItem.querySelector('textarea')!, `${frameItem.querySelector('textarea')!.value}is coming, the keeper climbs.`);
    expect(frameButton.disabled).toBe(false);
  });

  it('checks the joining word live', () => {
    const view = renderBlock(sentenceSet('sentence_combining'), 'student', { lessonId: 'lesson' });
    const last = items(view)[3]!;
    const helper = last.querySelector('.block-sentence__helper')!;
    expect(helper.textContent).toContain('Use ‘although’ to join them');
    type(last.querySelector('textarea')!, 'Although it rains, she goes.');
    expect(helper.textContent).toContain('Uses ‘although’ ✓');
  });

  it('counts words against the limit and asks calmly for a trim', () => {
    const block = sentenceSet('appositive');
    block.content.sentence = { fade: true, word_limit: 5 };
    const view = renderBlock(block, 'student', { lessonId: 'lesson' });
    expect(view.textContent).toContain('Up to 5 words for each sentence.');
    const last = items(view)[3]!;
    const helper = last.querySelector('.block-sentence__helper')!;
    expect(helper.textContent).toBe('0 / 5 words');
    type(last.querySelector('textarea')!, 'The keeper, a quiet man, climbs.');
    expect(helper.textContent).toBe('Trim to 5 words');
    expect(helper.classList.contains('block-sentence__helper--over')).toBe(true);
  });

  it('saves answers under format.<format> as strings keyed by question id', () => {
    const block = sentenceSet('note_to_topic');
    const view = renderBlock(block, 'student', { lessonId: 'lesson' });
    type(items(view)[3]!.querySelector('textarea')!, 'Alone for years, the keeper keeps the lamp lit.');
    const key = `${storageKey('lesson', block.id)}.format.note_to_topic`;
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ q4: 'Alone for years, the keeper keeps the lamp lit.' });
    const again = renderBlock(block, 'student', { lessonId: 'lesson' });
    expect(items(again)[3]!.querySelector('textarea')!.value).toBe('Alone for years, the keeper keeps the lamp lit.');
  });
});

describe('sentence formats: teacher and print', () => {
  it('teacher sees each item’s stage, frame and model answer, with no boxes', () => {
    const block = sentenceSet('sentence_combining');
    block.content.sentence = { fade: true, word_limit: 20 };
    const view = renderBlock(block, 'teacher');
    expect(view.querySelector('textarea')).toBeNull();
    expect([...view.querySelectorAll('.block-sentence__stage')].map((s) => s.textContent)).toEqual(['Worked example', 'Frame', 'Frame', 'On their own']);
    expect(items(view)[1]!.textContent).toContain('Frame: Although the storm');
    expect(items(view)[3]!.querySelector('.block-question-set__model-note')!.textContent).toMatch(/^Model answer: /);
    expect(view.textContent).toContain('Word limit: 20');
    expect(view.textContent).toContain('Use ‘although’');
  });
  it('display view reveals the model without typing', () => {
    const view = renderBlock(sentenceSet('appositive'), 'teacher', { display: true });
    const button = items(view)[3]!.querySelector<HTMLButtonElement>('.block-question-set__model-btn')!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(items(view)[3]!.querySelector<HTMLElement>('.block-question-set__model')!.hidden).toBe(false);
  });
  it('print shows the worked example, the frame then lines, and lines alone at the end', () => {
    const block = sentenceSet('sentence_expansion');
    block.content.sentence = { fade: true, word_limit: 25 };
    const view = renderBlock(block, 'print');
    const [first, second, , fourth] = items(view);
    expect(first!.querySelector('.block-sentence__worked')!.textContent).toContain('the keeper climbs the tower to light the lamp');
    expect(second!.querySelector('.block-question-set__frame')!.textContent).toMatch(/^Although the storm/);
    expect(second!.querySelector('.block-question-set__response-lines')).not.toBeNull();
    expect(fourth!.querySelector('.block-question-set__response-lines')).not.toBeNull();
    expect(fourth!.textContent).not.toContain('to light the lamp');
    expect(view.querySelector('.block-question-set__model-btn')).toBeNull();
    expect(view.textContent).toContain('Up to 25 words');
  });
});

describe('question set editor with a sentence format', () => {
  it('shows the sentence fields and keeps kernels, joining word, question words and frame through an edit', () => {
    let latest = sentenceSet('sentence_combining', 2);
    latest.content.questions[0]!.frame = 'Although the storm …';
    const editor = createQuestionSetEditor(latest, (next) => { latest = next; }, () => latest);
    document.body.append(editor);
    const kernels = editor.querySelector<HTMLTextAreaElement>('.block-editor__question-kernels')!;
    expect(kernels.closest<HTMLElement>('.block-editor__sentence')!.hidden).toBe(false);
    expect(kernels.placeholder).toBe('Kernel sentences, one per line');
    expect(editor.querySelector<HTMLElement>('.block-editor__sentence-settings')!.hidden).toBe(false);
    expect(editor.querySelector<HTMLElement>('.block-editor__sentence-words')!.hidden).toBe(true);

    const prompt = editor.querySelector<HTMLTextAreaElement>('.block-editor__question-prompt')!;
    type(prompt, 'Join these about the keeper');
    const q = latest.content.questions[0]!;
    expect(q.prompt).toBe('Join these about the keeper');
    expect(q.kernels).toEqual(['The keeper climbs the tower 1.', 'The storm is coming.']);
    expect(q.conjunction).toBe('although');
    expect(q.frame).toBe('Although the storm …');
    expect(q.model_answer).toMatch(/^Although/);

    type(kernels, 'The lamp is lit.\n\nThe ships pass safely.');
    expect(latest.content.questions[0]!.kernels).toEqual(['The lamp is lit.', 'The ships pass safely.']);
    pickKitOption(editor.querySelector('.block-editor__question-conjunction'), 'because');
    expect(latest.content.questions[0]!.conjunction).toBe('because');
    pickKitOption(editor.querySelector('.block-editor__question-conjunction'), 'any');
    expect(latest.content.questions[0]!.conjunction).toBeUndefined();

    const limit = editor.querySelector<HTMLInputElement>('.block-editor__sentence-limit')!;
    type(limit, '15');
    expect(latest.content.sentence).toEqual({ fade: true, word_limit: 15 });
    type(limit, '');
    expect(latest.content.sentence).toEqual({ fade: true });
    pickKitOption(editor.querySelector('.block-editor__sentence-fade'), 'off');
    expect(latest.content.sentence?.fade).toBe(false);
    expect(() => BlockSchema.parse(JSON.parse(JSON.stringify(latest)))).not.toThrow();
  });

  it('toggles question words for expansion and hides sentence fields for other formats', () => {
    let latest = sentenceSet('sentence_expansion', 1);
    const editor = createQuestionSetEditor(latest, (next) => { latest = next; }, () => latest);
    document.body.append(editor);
    const how = editor.querySelector<HTMLButtonElement>('.block-editor__sentence-word[data-word="how"]')!;
    how.click();
    expect(latest.content.questions[0]!.question_words).toEqual(['who', 'when', 'why', 'how']);
    editor.querySelector<HTMLButtonElement>('.block-editor__sentence-word[data-word="who"]')!.click();
    expect(latest.content.questions[0]!.question_words).toEqual(['when', 'why', 'how']);

    pickKitOption(editor.querySelector('.block-editor__format-choice'), 'standard');
    expect(editor.querySelector<HTMLElement>('.block-editor__sentence')!.hidden).toBe(true);
    expect(editor.querySelector<HTMLElement>('.block-editor__sentence-settings')!.hidden).toBe(true);
    type(editor.querySelector<HTMLTextAreaElement>('.block-editor__question-prompt')!, 'Edited under standard');
    // Switching away keeps the material for switching back.
    expect(latest.content.questions[0]!.kernels).toEqual(['The keeper climbs the tower 1.']);
    expect(latest.content.questions[0]!.question_words).toEqual(['when', 'why', 'how']);
  });
});
