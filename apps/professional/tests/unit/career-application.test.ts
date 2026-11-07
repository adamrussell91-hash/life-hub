import { describe, expect, it } from 'vitest';
import {
  addBracketsLabel,
  costLine,
  countAddBrackets,
  countWords,
  criterionForSave,
  formatCost,
  historyEstimateSentence,
  mergeSplitCriteria,
  overLimit,
  parseWordLimit,
  wordCountLabel
} from '@/domain/career-application';
import { historyProgressLine, readKindsLine } from '@/views/career-skills-scan';

describe('word limits from the ad', () => {
  it('reads words, max words and pages, and leaves lines without a limit alone', () => {
    expect(parseWordLimit('Demonstrated leadership of a faculty team (250 words)')).toBe(250);
    expect(parseWordLimit('Expert syllabus knowledge, max 300 words')).toBe(300);
    expect(parseWordLimit('Maximum of 1,000 words')).toBe(1000);
    expect(parseWordLimit('Leading staff learning (1 page)')).toBe(500);
    expect(parseWordLimit('Two pages at most')).toBe(1000);
    expect(parseWordLimit('Half a page on wellbeing')).toBe(250);
    expect(parseWordLimit('Commitment to student wellbeing')).toBeNull();
  });

  it('keeps a limit inside the schema range', () => {
    expect(parseWordLimit('10 words')).toBe(25);
    expect(parseWordLimit('5000 words')).toBe(2000);
  });
});

describe('counts', () => {
  it('counts words and turns over the limit', () => {
    expect(countWords('  I led   a team.\nThen another. ')).toBe(6);
    expect(countWords('')).toBe(0);
    expect(wordCountLabel('one two three', 250)).toBe('3 / 250 words');
    expect(wordCountLabel('one', null)).toBe('1 word');
    expect(overLimit('one two three', 2)).toBe(true);
    expect(overLimit('one two', 2)).toBe(false);
    expect(overLimit('one two three', null)).toBe(false);
  });

  it('counts [add: …] brackets Ann left for Adam', () => {
    const cv = 'Profile\n[add: teaching registration number]\n[Add: first aid expiry] [note] [add:referees]';
    expect(countAddBrackets(cv)).toBe(3);
    expect(addBracketsLabel(3)).toBe('3 things to add');
    expect(addBracketsLabel(1)).toBe('1 thing to add');
    expect(addBracketsLabel(0)).toBe('');
  });
});

describe('cost lines', () => {
  it('says cents under a dollar and dollars from one', () => {
    expect(formatCost(0.1)).toBe('10c');
    expect(costLine(0.35)).toBe('About 35c');
    expect(formatCost(1.2)).toBe('$1.20');
    expect(historyEstimateSentence({ sources: 412, batches: 11, cost_aud: 0.88 })).toBe(
      '412 records in 11 batches, about 88c. Go?'
    );
    expect(historyEstimateSentence({ sources: 600, batches: 15, cost_aud: 1.2 })).toBe(
      '600 records in 15 batches, about $1.20. Go?'
    );
    expect(historyEstimateSentence({ sources: 1, batches: 1, cost_aud: 0.08 })).toBe('1 record in 1 batch, about 8c. Go?');
    expect(historyEstimateSentence({ sources: 0, batches: 0, cost_aud: 0 })).toBe('Nothing to read in that window.');
  });
});

describe('the Skills scan panel lines', () => {
  it('names what the scan read, and says so when it read nothing', () => {
    expect(readKindsLine(['teaching:lesson', 'professional:meeting', 'tasks:task'])).toBe('Read: meetings, tasks, lessons.');
    expect(readKindsLine([])).toBe('Read: nothing on the last run.');
    expect(readKindsLine(undefined)).toBe('');
  });

  it('shows the batch being read', () => {
    expect(historyProgressLine({ status: 'running', batch: 3, batches: 11, proposals_added: 0 })).toBe('Batch 4 of 11.');
    expect(historyProgressLine({ status: 'done', batch: 11, batches: 11, proposals_added: 7 })).toBe(
      'History scan finished: 7 new proposals.'
    );
  });
});

describe('a criteria save sends only schema keys', () => {
  it('drops notes and evidence_refs, keeps id and the new keys', () => {
    const saved = criterionForSave({
      id: 'acrit_1',
      criterion: 'Leads a team',
      response: 'Mine',
      order: 1,
      completed: false,
      word_limit: 250,
      response_source: 'adam',
      notes: 'old key',
      evidence_refs: []
    } as never);
    expect(Object.keys(saved).sort()).toEqual(
      ['completed', 'criterion', 'id', 'order', 'response', 'response_source', 'word_limit'].sort()
    );
  });

  it('keeps existing criteria, adds new lines after them with their limits, and skips repeats', () => {
    const { criteria, added } = mergeSplitCriteria(
      [{ id: 'acrit_1', criterion: 'Leads a team', response: 'Mine', order: 1, completed: false, check: null }],
      ['Leads a team', 'Knows the syllabus (300 words)', 'Cares for students']
    );
    expect(added).toBe(2);
    expect(criteria.map((c) => [c.id ?? null, c.criterion, c.order, c.word_limit ?? null])).toEqual([
      ['acrit_1', 'Leads a team', 1, null],
      [null, 'Knows the syllabus (300 words)', 2, 300],
      [null, 'Cares for students', 3, null]
    ]);
    expect(criteria[0]!.response).toBe('Mine');
    for (const c of criteria) {
      expect(c).not.toHaveProperty('notes');
      expect(c).not.toHaveProperty('evidence_refs');
    }
  });
});
