// apps/tasks/scripts/question-book-mock.ts
// The Question Book's API for local dev and the app tests: the same routes and envelope as
// netlify/functions/question-book.mjs, over an in-memory store and an INVENTED set of questions.
// The book's own question texts live only in the private data repository, so none appear here:
// every prompt below is our own neutral stand-in, chosen to cover each response type at least
// once across a few real chapters (and the five charts in their parent chapters).
import { CHAPTERS, CHARTS, GROUPS, OWN_CHAPTER, RULES, chapter as catalogueChapter } from '../../../packages/question-book/catalogue.mjs';
import { AnswerError, describeAnswer, isAnswered, normalizeAnswer } from '../../../packages/question-book/answers.mjs';

type Part = { label: string } | { options: string[] };
export type MockQuestion = { id: string; chapter: string; n: number; prompt: string; parts: Part[]; response: Record<string, unknown> & { type: string }; from?: string };

let n = 900;
const q = (chapter: string, prompt: string, response: MockQuestion['response'], parts: Part[] = [], from?: string): MockQuestion => {
  n += 1;
  return { id: `qb_question_${n}`, chapter, n, prompt, parts, response, ...(from ? { from } : {}) };
};

/** Invented questions: every response type at least once. */
export const MOCK_QUESTIONS: MockQuestion[] = [
  q('qb_right_now', 'What did you notice first when you woke up today?', { type: 'text' }),
  q('qb_right_now', 'Think of a small object on your desk.', { type: 'text' }, [{ label: 'What is it?' }, { label: 'Why is it there?' }]),
  q('qb_right_now', 'Do you hum while you cook?', { type: 'choices_with_followups' }, [{ options: ['often', 'sometimes', 'never'] }, { label: 'What tune?' }], 'Odds and ends'),
  q('qb_right_now', 'Three snacks you would invent:', { type: 'list', count: 3 }),
  q('qb_right_now', 'When does your day feel most your own?', { type: 'time' }),
  q('qb_right_now', 'Which window seat do you choose?', { type: 'choices', options: ['aisle', 'window', 'whichever is free'] }),
  q('qb_right_now', 'Which shape suits this week?', { type: 'image_choice', options: ['circle', 'square', 'triangle'] }),
  q('qb_right_now', 'How tidy is your desk right now?', { type: 'continuum', low: 'chaos', high: 'gleaming', numeric: true, min: 0, max: 10, midpoint: 5 }),
  q('qb_right_now', 'Where does your attention sit today?', { type: 'continuum', low: 'scattered', high: 'focused', numeric: false }),
  q('qb_right_now', 'How full is your energy tank?', { type: 'gauge', min: 1, max: 10, low: 'empty', high: 'full' }),

  q('qb_career', 'Place the paid jobs you have done:', { type: 'chart', chart: 'qb_paid_work_map' }),
  q('qb_career', 'Rank what matters most in a working week:', { type: 'ranking', items: ['quiet time', 'good colleagues', 'clear goals', 'variety'] }),
  q('qb_career', 'Which of these do you do each week?', { type: 'choice_table', columns: ['yes', 'sometimes', 'no'], rows: ['plan the week ahead', 'tidy your inbox', 'take a proper lunch'] }),
  q('qb_career', 'What would you change first about your job?', { type: 'text' }),
  q('qb_career', 'Which of the last two questions was easier to answer?', { type: 'comparison', questionRefs: ['qb_question_913', 'qb_question_914'] }),
  q('qb_career', 'Split a free working afternoon:', { type: 'shares', labels: ['reading', 'making', 'talking'], total: null, proposedTotal: 100 }),
  q('qb_career', 'Where are you on the ladder?', { type: 'ladder_markers', markers: { A: 'where you are', B: 'where you want to be', C: 'the highest you have been' }, min: 0, max: 10, midpoint: 5 }),

  q('qb_you_and_your_siblings', 'One word each sibling might use for you:', { type: 'sibling_table', columns: ['Eldest', 'Middle', 'Youngest'], cellType: 'text' }),
  q('qb_you_and_your_siblings', 'The first and last time you shared a room:', { type: 'paired_times', columns: ['First time', 'Last time'] }),
  q('qb_you_and_your_siblings', 'Three things you share, overlapping:', { type: 'three_circle_diagram', slots: 3 }),
  q('qb_you_and_your_siblings', 'Map who talks to whom most often.', { type: 'relationship_map' }),
  q('qb_you_and_your_siblings', 'Sketch the house you grew up in.', { type: 'drawing' }),

  q('qb_your_future', 'Your outlook on a few scales:', { type: 'profile', min: 0, max: 10, midpoint: 5, scales: [{ low: 'cautious', high: 'bold' }, { low: 'alone', high: 'together' }, { low: 'planned', high: 'improvised' }] }),
  q('qb_your_future', 'A hope for each of these:', { type: 'topic_fields', topics: ['work', 'home', 'health'] }),
  q('qb_your_future', 'Ten years from now:', { type: 'scenario_fields', fields: ['Best case', 'Most likely', 'Worst case'], horizonYears: 10 }),
  q('qb_your_future', 'Pick one from each pair:', { type: 'paired_choices', pairs: [['sea', 'hills'], ['city', 'village'], ['early', 'late']] }),
  q('qb_your_future', 'Where do you feel calm in your body?', { type: 'body_markers' }),
  q('qb_your_future', 'Places you would like to live one day:', { type: 'map_markers' }),

  q('qb_communicating', 'Place how you talk about six topics:', { type: 'chart', chart: 'qb_communication_map' }),
  q('qb_communicating', 'Which conversation went better than you expected this month?', { type: 'text' }),
  q('qb_mind_and_body', 'Place some memories of pain:', { type: 'chart', chart: 'qb_pain_map' }),
  q('qb_money_and_possessions', 'Plot your valuable possessions:', { type: 'chart', chart: 'qb_possessions_map' }),
  q('qb_money_and_possessions', 'What did you last buy that you still enjoy?', { type: 'text' }),
  q('qb_your_friends', 'Place five friends:', { type: 'chart', chart: 'qb_friendship_map' })
];

type Answer = { value: unknown; updatedAt: string };
type Note = { id: string; at: string; observation: string; question: string; answered: number };
type OwnEntry = { id: string; question: string; answer: string; updatedAt: string; history: unknown[] };

const ok = (data: unknown) => ({ status: 200, body: { ok: true, data } });
const fail = (status: number, code: string, message: string) => ({ status, body: { ok: false, error: { code, message } } });
const publicChapter = (ch: { id: string; title: string; group: string; order: number; kind: string; when: string }) => ({ id: ch.id, title: ch.title, group: ch.group, order: ch.order, kind: ch.kind, when: ch.when });
const chartDef = (id: string) => {
  const c = CHARTS.find((chart: { id: string }) => chart.id === id);
  return c ? { title: c.title, family: c.family, structure: c.structure } : null;
};

/** The mock: one in-memory notebook. `seedAnswers` pre-answers two questions so the shelf shows progress. */
export function createQuestionBookMock({ now = () => Date.now(), seedAnswers = true }: { now?: () => number; seedAnswers?: boolean } = {}) {
  const answers = new Map<string, Record<string, Answer>>();
  const history = new Map<string, Answer[]>();
  const notes = new Map<string, Note[]>();
  const updated = new Map<string, string>();
  let own: OwnEntry[] = [];
  let ownUpdatedAt: string | null = null;
  let noteSeq = 0;
  const iso = () => new Date(now()).toISOString();
  const questionsIn = (chapterId: string) => MOCK_QUESTIONS.filter((x) => x.chapter === chapterId);
  const byId = (id: string) => MOCK_QUESTIONS.find((x) => x.id === id) ?? null;
  const chartOf = (question: MockQuestion) => (question.response.type === 'chart' ? chartDef(String(question.response.chart)) : null);
  const answeredIn = (chapterId: string) => questionsIn(chapterId).filter((x) => answers.get(chapterId)?.[x.id] && isAnswered(x, answers.get(chapterId)![x.id].value)).length;

  if (seedAnswers) {
    const at = '2026-10-27T09:00:00.000Z';
    answers.set('qb_right_now', { qb_question_901: { value: { main: 'Rain on the skylight.' }, updatedAt: at }, qb_question_904: { value: { main: ['toast crisps', 'pear jelly', ''] }, updatedAt: at } });
    updated.set('qb_right_now', at);
  }

  function list() {
    const chapters = CHAPTERS.map((ch: Parameters<typeof publicChapter>[0]) => {
      if (ch.kind === 'own') return { ...publicChapter(ch), total: own.length, answered: own.filter((e) => e.answer).length, updatedAt: ownUpdatedAt };
      if (ch.kind === 'rules') return { ...publicChapter(ch), total: 0, answered: 0, updatedAt: null };
      return { ...publicChapter(ch), total: questionsIn(ch.id).length, answered: answeredIn(ch.id), updatedAt: updated.get(ch.id) ?? null };
    });
    return { groups: GROUPS.map((g: object) => ({ ...g })), chapters };
  }

  function read(chapterId: string) {
    const ch = catalogueChapter(chapterId);
    if (!ch) return fail(404, 'not_found', 'That chapter isn’t in the book.');
    const base = { chapter: publicChapter(ch), questions: [] as MockQuestion[], charts: {} as Record<string, unknown>, answers: {} as Record<string, Answer>, notes: notes.get(ch.id) ?? [] };
    if (ch.kind === 'rules') return ok({ ...base, rules: RULES.map((r: object) => ({ ...r })) });
    if (ch.kind === 'own') return ok({ ...base, own });
    const charts = Object.fromEntries(CHARTS.filter((c: { chapter: string }) => c.chapter === ch.id).map((c: { id: string }) => [c.id, chartDef(c.id)]));
    return ok({ ...base, questions: questionsIn(ch.id), charts, answers: answers.get(ch.id) ?? {} });
  }

  function save(body: { chapter?: string; question?: string; value?: unknown }) {
    const ch = catalogueChapter(body?.chapter ?? '');
    if (!ch) return fail(404, 'not_found', 'That chapter isn’t in the book.');
    const question = byId(body.question ?? '');
    if (!question || question.chapter !== ch.id) return fail(404, 'not_found', 'That question isn’t in this chapter.');
    if (!('value' in body)) return fail(400, 'bad_request', 'Send a value, or null to clear the answer.');
    let value: unknown;
    try {
      value = normalizeAnswer(question, body.value, chartOf(question));
    } catch (e) {
      if (e instanceof AnswerError) return fail(400, (e as AnswerError & { code: string }).code, e.message);
      throw e;
    }
    const at = iso();
    const doc = answers.get(ch.id) ?? {};
    const previous = doc[question.id];
    if (previous && JSON.stringify(previous.value) !== JSON.stringify(value)) {
      history.set(`${ch.id}/${question.id}`, [previous, ...(history.get(`${ch.id}/${question.id}`) ?? [])].slice(0, 20));
    }
    if (value === null) delete doc[question.id];
    else doc[question.id] = { value, updatedAt: at };
    answers.set(ch.id, doc);
    updated.set(ch.id, at);
    return ok({ question: question.id, answer: value === null ? null : { value, updatedAt: at }, answered: answeredIn(ch.id), total: questionsIn(ch.id).length });
  }

  function saveOwn(body: { own?: Array<{ id: string; question?: string; answer?: string }> }) {
    if (!Array.isArray(body.own)) return fail(400, 'bad_request', 'Send your questions as a list.');
    const at = iso();
    const before = new Map(own.map((e) => [e.id, e]));
    own = body.own
      .map((e) => ({ id: e.id, question: (e.question ?? '').trim(), answer: (e.answer ?? '').trim() }))
      .filter((e) => e.question || e.answer)
      .map((e) => {
        const old = before.get(e.id);
        return old && old.question === e.question && old.answer === e.answer ? old : { ...e, updatedAt: at, history: old?.history ?? [] };
      });
    ownUpdatedAt = at;
    return ok({ own, answered: own.filter((e) => e.answer).length, total: own.length });
  }

  function notice(body: { chapter?: string }) {
    const ch = catalogueChapter(body?.chapter ?? '');
    if (!ch || ch.kind === 'rules') return fail(400, 'bad_request', 'That chapter can’t take this.');
    const items = ch.kind === 'own'
      ? own.filter((e) => e.question && e.answer).map((e) => e.answer)
      : questionsIn(ch.id).filter((x) => answers.get(ch.id)?.[x.id]).map((x) => describeAnswer(x, answers.get(ch.id)![x.id].value, chartOf(x)));
    if (items.length < 3) return fail(400, 'too_few', 'Answer at least 3 questions in this chapter first.');
    noteSeq += 1;
    const note: Note = { id: `note_${noteSeq}`, at: iso(), observation: 'Several of your answers lean towards small, quiet comforts over big plans. (A practice reply from the local mock.)', question: 'Which of those comforts would you most like to protect next week?', answered: items.length };
    notes.set(ch.id, [note, ...(notes.get(ch.id) ?? [])].slice(0, 20));
    return ok({ note, notes: notes.get(ch.id), cost: 'about 3 cents' });
  }

  /** Answers one request, or null when the path isn't the Question Book's. */
  function handle(method: string, url: URL, body?: unknown): { status: number; body: unknown } | null {
    if (url.pathname === '/api/question-book/notice') return method === 'POST' ? notice((body ?? {}) as { chapter?: string }) : fail(405, 'method_not_allowed', 'POST only.');
    if (url.pathname !== '/api/question-book') return null;
    if (method === 'GET') {
      const chapterId = url.searchParams.get('chapter');
      const qid = url.searchParams.get('history');
      if (chapterId && qid) return ok({ question: qid, versions: history.get(`${chapterId}/${qid}`) ?? [] });
      if (chapterId) return read(chapterId);
      return ok(list());
    }
    if (method === 'PUT') {
      const payload = (body ?? {}) as { chapter?: string };
      return payload.chapter === OWN_CHAPTER ? saveOwn(payload as Parameters<typeof saveOwn>[0]) : save(payload as Parameters<typeof save>[0]);
    }
    return fail(405, 'method_not_allowed', 'GET, PUT or POST.');
  }

  return { handle };
}
