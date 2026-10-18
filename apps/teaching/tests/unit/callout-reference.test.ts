import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalloutBlockSchema, type Block } from '@/schemas/block';
import { decorateCalloutReferences, refreshCalloutReferences, resolvedCalloutStyle, calloutTargets, calloutIdentity, createCalloutTargetPicker } from '@/blocks/callout-reference';

const activity = { id: 'activity', block_type: 'question_set', visibility: 'student_teacher', content: { title: 'Video questions', questions: [{ id: 'q1', prompt: 'First?' }, { id: 'q2', prompt: 'Why does habit change perception?' }] } } as Block;
const callout = { id: 'extension', type: 'block', block_type: 'callout', visibility: 'student_teacher', content: { style: 'extension', body: 'Try another view.', related_to: { block_id: 'activity', question_id: 'q2' } } } as Block;
afterEach(() => document.body.replaceChildren());

describe('callout references', () => {
  it('shows every attached callout type and jumps to each independent block', () => {
    const example = { ...callout, id: 'example', content: { ...callout.content, style: 'example', title: 'Worked response', body: 'A concrete response.' } } as Block;
    const extra = { ...callout, id: 'extension2', content: { ...callout.content, title: 'Another challenge' } } as Block;
    const privateNote = { ...callout, id: 'private', visibility: 'teacher_only', content: { ...callout.content, style: 'teacher' } } as Block;
    const blocks = [activity, callout, example, extra, privateNote];
    const scope = document.createElement('div'); scope.className = 'lesson-blocks';
    scope.innerHTML = '<div class="block" data-block-id="activity"><p data-question-id="q2">Why?</p></div><div class="block" data-block-id="extension"></div><div class="block" data-block-id="example"></div><div class="block" data-block-id="extension2"></div>';
    document.body.append(scope);
    const target = scope.firstElementChild as HTMLElement;
    decorateCalloutReferences(target, activity, 'student', blocks);
    const badges = target.querySelectorAll<HTMLElement>('.callout-ref-list > .callout-reference');
    expect(badges).toHaveLength(3);
    expect(Array.from(badges).map(badge => badge.querySelector('summary')?.textContent)).toEqual(['Extension', 'Example', 'Extension']);
    expect(badges[1]!.textContent).toContain('A concrete response.');
    const destination = scope.querySelector<HTMLElement>('[data-block-id="example"]')!;
    destination.scrollIntoView = vi.fn();
    (badges[1]!.querySelector('.callout-ref__jump') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(destination);
    expect(destination.scrollIntoView).toHaveBeenCalled();
    expect(badges[0]!.querySelector('svg')?.innerHTML).toBe(calloutIdentity('extension').querySelector('svg')?.innerHTML);
    expect(badges[1]!.querySelector('svg')?.innerHTML).toBe(calloutIdentity('example').querySelector('svg')?.innerHTML);
    expect(target.textContent).not.toContain('Teacher');
  });
  it('wraps multiple callouts attached to a whole block in one flow container', () => {
    const first = { ...callout, content: { ...callout.content, related_to: {block_id:'activity'} } } as Block;
    const second = { ...first, id:'example', content:{...first.content,style:'example'} } as Block;
    const wrapper = document.createElement('div'); wrapper.className = 'block'; wrapper.dataset.blockId = 'activity';
    wrapper.innerHTML = '<h2>Activity</h2>';
    document.body.append(wrapper);
    decorateCalloutReferences(wrapper, activity, 'teacher', [activity, first, second]);
    expect(Array.from(wrapper.children).filter(child => child.classList.contains('callout-ref-list'))).toHaveLength(1);
    expect(wrapper.querySelectorAll('.callout-ref-list > .callout-reference')).toHaveLength(2);
    expect(wrapper.querySelector('h2')?.textContent).toBe('Activity');
    // Corner badges sit beside the feedback dot rather than adding a row above the content.
    expect(wrapper.querySelector('.callout-ref-list')?.classList.contains('callout-ref-list--corner')).toBe(true);
    expect(wrapper.classList.contains('callout-ref-host')).toBe(true);
  });
  it('keeps whole-block badges in the flow when printing', () => {
    const first = { ...callout, content: { ...callout.content, related_to: {block_id:'activity'} } } as Block;
    const wrapper = document.createElement('div'); wrapper.className = 'block'; wrapper.dataset.blockId = 'activity';
    decorateCalloutReferences(wrapper, activity, 'print', [activity, first]);
    expect(wrapper.querySelector('.callout-ref-list--corner')).toBeNull();
  });
  it('lets the teacher choose a question, preserves the chosen target, and can clear it', () => {
    const change = vi.fn();
    const picker = createCalloutTargetPicker(callout as Extract<Block, {block_type:'callout'}>, [activity, callout], change);
    expect(picker.selectedOptions[0]?.textContent).toBe('Video questions · Question 2');
    expect(Array.from(picker.options).some(option => option.textContent?.includes('extension'))).toBe(false);
    picker.value = JSON.stringify(['activity', 'q1']); picker.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenLastCalledWith({block_id:'activity',question_id:'q1'});
    picker.value = ''; picker.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenLastCalledWith(undefined);
  });
  it('keeps the saved target through schema parsing', () => {
    const parsed = CalloutBlockSchema.parse({ ...callout, created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:00Z', schema_version: 1 });
    expect(parsed.content).toHaveProperty('related_to', { block_id: 'activity', question_id: 'q2' });
  });
  it('offers whole activities and individual questions without raw ids', () => {
    expect(calloutTargets([activity], 'teacher').map(t => t.label)).toEqual(['Video questions', 'Video questions · Question 1', 'Video questions · Question 2']);
  });
  it('identifies every callout style with a labelled symbol', () => {
    for (const type of ['information','important','warning','extension','scaffold','example','remember','teacher']) {
      const identity = calloutIdentity(type);
      expect(identity.textContent?.toLowerCase()).toBe(type);
      expect(identity.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });
  it('adds matching markers to separate blocks and jumps to the exact question', () => {
    const scope = document.createElement('div'); scope.className = 'lesson-blocks';
    const target = document.createElement('div'); target.dataset.blockId = 'activity';
    target.innerHTML = '<p data-question-id="q1">First?</p><p data-question-id="q2">Why does habit change perception?</p>';
    const source = document.createElement('div'); source.dataset.blockId = 'extension'; source.innerHTML = '<aside class="callout"><div class="callout__head"></div></aside>';
    scope.append(target, source); document.body.append(scope);
    const blocks = [activity, callout];
    decorateCalloutReferences(target, activity, 'student', blocks);
    decorateCalloutReferences(source, callout, 'student', blocks);
    expect(target.querySelector('[data-question-id="q1"] .callout-ref')).toBeNull();
    expect(target.querySelector('[data-question-id="q2"] .callout-ref')?.textContent).toBe('Extension');
    expect(source.querySelector('summary')?.getAttribute('aria-label')).toContain('Extension');
    expect(source.textContent).toContain('Why does habit change perception?');
    const question = target.querySelector<HTMLElement>('[data-question-id="q2"]')!;
    question.scrollIntoView = vi.fn();
    (source.querySelector('.callout-ref__jump') as HTMLButtonElement).click();
    expect(document.activeElement).toBe(question);
    expect(question.scrollIntoView).toHaveBeenCalled();
    expect(source.parentElement).toBe(target.parentElement);
  });
  it('does not leak a teacher-only target or turn a missing question into a whole-block link', () => {
    const hidden = { ...activity, visibility: 'teacher_only' } as Block;
    expect(calloutTargets([hidden], 'student')).toEqual([]);
    const source = document.createElement('div'); source.innerHTML = '<aside class="callout"><div class="callout__head"></div></aside>';
    const stale = { ...callout, content: { ...callout.content, related_to: { block_id: 'activity', question_id: 'gone' } } } as Block;
    decorateCalloutReferences(source, stale, 'student', [activity, stale]);
    expect(source.querySelector('summary')).toBeNull();
    expect(source.textContent).not.toContain('Why does habit');
  });
  it('keeps the same question linked after reordering questions', () => {
    const reordered = { ...activity, content: { ...activity.content, questions: [...(activity as Extract<Block,{block_type:'question_set'}>).content.questions].reverse() } } as Block;
    const source = document.createElement('div'); source.innerHTML = '<aside class="callout"><div class="callout__head"></div></aside>';
    decorateCalloutReferences(source, callout, 'student', [reordered, callout]);
    expect(source.querySelector('summary')?.textContent).toContain('Question 1');
    expect(source.textContent).toContain('Why does habit change perception?');
  });
  it('reveals an accordion and its hidden tab before jumping', () => {
    const scope = document.createElement('div'); scope.className = 'lesson-blocks';
    scope.innerHTML = '<button role="tab" aria-controls="target-panel">Activity</button><div role="tabpanel" id="target-panel" hidden><details><summary>Questions</summary><div data-block-id="activity"><p data-question-id="q2">Why?</p></div></details></div><div data-block-id="extension"><aside class="callout"><div class="callout__head"></div></aside></div>';
    document.body.append(scope);
    const panel = scope.querySelector<HTMLElement>('[role="tabpanel"]')!;
    scope.querySelector('button')!.addEventListener('click', () => panel.hidden = false);
    const source = scope.querySelector<HTMLElement>('[data-block-id="extension"]')!;
    decorateCalloutReferences(source, callout, 'student', [activity, callout]);
    (source.querySelector('.callout-ref__jump') as HTMLButtonElement).click();
    expect(panel.hidden).toBe(false);
    expect(scope.querySelector('details')!.open).toBe(true);
    expect(document.activeElement).toBe(scope.querySelector('[data-question-id="q2"]'));
  });
  it('Escape closes the preview and returns focus to its marker', () => {
    const source = document.createElement('div'); source.innerHTML = '<aside class="callout"><div class="callout__head"></div></aside>'; document.body.append(source);
    decorateCalloutReferences(source, callout, 'teacher', [activity, callout]);
    const details = source.querySelector('details')!; details.open = true;
    details.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(source.querySelector('summary'));
  });
  it('opens a lazy tab whose target has not been rendered yet', () => {
    const tabs = {id:'tabs',block_type:'tabs',visibility:'student_teacher',content:{tabs:[{id:'second',label:'More',blocks:[activity]}]}} as unknown as Block;
    const scope = document.createElement('div'); scope.className = 'lesson-blocks';
    scope.innerHTML = '<button role="tab" aria-controls="tabs-panel-second">More</button><div role="tabpanel" id="tabs-panel-second" hidden></div><div data-block-id="extension"><aside class="callout"><div class="callout__head"></div></aside></div>';
    document.body.append(scope);
    const panel = scope.querySelector<HTMLElement>('[role="tabpanel"]')!;
    scope.querySelector('button')!.addEventListener('click', () => {
      panel.hidden = false;
      panel.innerHTML = '<div data-block-id="activity"><p data-question-id="q2">Why?</p></div>';
    });
    const source = scope.querySelector<HTMLElement>('[data-block-id="extension"]')!;
    decorateCalloutReferences(source, callout, 'student', [tabs, callout]);
    (source.querySelector('.callout-ref__jump') as HTMLButtonElement).click();
    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(panel.querySelector('[data-question-id="q2"]'));
  });
  it('updates and removes markers on other blocks when a link changes without rebuilding the editor', () => {
    const scope = document.createElement('div');
    scope.innerHTML = '<input aria-label="Editing"><div class="block" data-block-id="activity"><p data-question-id="q1">First?</p><p data-question-id="q2">Why?</p></div><div class="block" data-block-id="extension"><aside class="callout"><div class="callout__head"></div></aside></div>';
    const input = scope.querySelector('input');
    refreshCalloutReferences(scope, [activity, callout], 'teacher');
    expect(scope.querySelector('[data-question-id="q2"] .callout-ref')?.textContent).toBe('Extension');
    const moved = {...callout, content:{...callout.content,related_to:{block_id:'activity',question_id:'q1'}}} as Block;
    refreshCalloutReferences(scope, [activity, moved], 'teacher');
    expect(scope.querySelector('[data-question-id="q2"] .callout-ref')).toBeNull();
    expect(scope.querySelector('[data-question-id="q1"] .callout-ref')?.textContent).toBe('Extension');
    refreshCalloutReferences(scope, [activity, {...callout,content:{style:'extension',body:'No link'}} as Block], 'teacher');
    expect(scope.querySelectorAll('.callout-ref, .callout-ref-list')).toHaveLength(0);
    expect(scope.querySelector('input')).toBe(input);
  });
});

describe('cultural warning identity', () => {
  it('recognises explicitly titled legacy notices without changing ordinary information', () => {
    expect(resolvedCalloutStyle({style: 'information', title: 'Cultural Warning for Teachers and Students'})).toBe('cultural_warning');
    expect(resolvedCalloutStyle({style: 'information', title: 'Video information'})).toBe('information');
    expect(resolvedCalloutStyle({style: 'warning', title: 'Cultural warning'})).toBe('warning');
    expect(calloutIdentity('cultural_warning').textContent).toBe('Cultural warning');
  });
});
