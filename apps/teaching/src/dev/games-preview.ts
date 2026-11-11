import { apiGet } from '@/api/client';
import { el } from '@/quiz/dom';
import { setUnitDeep } from '@/deep/context';
import type { Lesson } from '@/schemas/lesson';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { mountGameEditor } from '@/games/editor';
import { mountGameArcade } from '@/games/arcade';
import { gameClient, gameTeacherApi, type GameClient } from '@/games/api';
import '@/games/kinds';
import { FIND_A_WORD } from '../../scripts/mock-grid-games';
import { splitGame } from '@/games/core/model';
import { GameLessonSchema } from '@/games/core/schema';
import '../styles/app.css';

/**
 * Game lessons preview: the teacher's build tabs and the student's arcade.
 * Everything here is invented (the novella "Harbour Lights", its cast and
 * class). The dev mock API seeds the same lesson as `lesson_game_harbour` in
 * class `class_2026_09eng`, so Build from this unit, Results and the arcade's
 * scores go through the real Functions. Open /games.html; `?view=arcade` or
 * `?view=editor` shows one side only.
 *
 * The arcade plays the real players (games/kinds/): crossword, find-a-word,
 * Connections and Who said it?. "Drop the network" makes every send fail, to
 * watch the queue keep the answers and retry.
 */

const LESSON_ID = 'lesson_game_harbour';
const CLASS_ID = 'class_2026_09eng';

setUnitDeep([
  {
    id: 'du_demo_gm', claim: 'Setting can carry a character’s feeling.', why: '', dot_points: [], concept_bullets: [], shared_piece_ids: [], steps: [],
    pieces: [
      { id: 'kp_sim1', text: 'A simile compares with like or as', tier: 'essential' },
      { id: 'kp_path1', text: 'Weather can mirror a mood', tier: 'essential' },
      { id: 'kp_isol1', text: 'The keeper’s isolation grows', tier: 'strong' }
    ]
  }
] as never);

const term = (id: string, word: string, clue: string, pieces: string[] = []) => ({ id, shape: 'term', term: word, clues: [{ kind: 'definition', text: clue }], pieces });
const draftGame = GameLessonSchema.parse({
  games: [
    {
      id: 'g_cross', kind: 'crossword', title: 'Technique crossword',
      items: [
        term('t1', 'Simile', 'A comparison using like or as', ['kp_sim1']),
        term('t2', 'Pathetic fallacy', 'Weather that mirrors a mood', ['kp_path1']),
        term('t3', 'Alliteration', 'Repeated first sounds'),
        term('t4', 'Sibilance', 'Repeated s sounds'),
        term('t5', 'Hyperbole', 'Deliberate exaggeration'),
        term('t6', 'Oxymoron', 'Two opposites side by side')
      ]
    },
    FIND_A_WORD,
    {
      id: 'g_who', kind: 'who_said_it', title: 'Who said it in Harbour Lights',
      cast: [{ id: 'c_keeper', name: 'The Keeper' }, { id: 'c_gull', name: 'Mara Gull' }],
      items: [
        { id: 'q1', shape: 'quote', text: 'The lamp is my only friend tonight.', speaker: 'c_keeper', source: 'Chapter 1', pieces: ['kp_isol1'] },
        { id: 'q2', shape: 'quote', text: 'Nobody rows out here for fun.', speaker: 'c_gull', source: 'Chapter 2' },
        { id: 'q5', shape: 'quote', text: 'I sold the boat for a song and a loaf.', speaker: 'fake', why_fake: 'Mara never leaves the island.' }
      ]
    },
    {
      id: 'g_wall', kind: 'connections', title: 'Sound and image wall',
      walls: [{ id: 'w1', title: 'Wall one', groups: [{ id: 'grp_sound', shape: 'group', label: 'Sound devices', tiles: ['Sibilance', 'Assonance', 'Onomatopoeia', 'Plosives'], difficulty: 1, why: 'All sound.' }] }]
    },
    { id: 'g_wager', kind: 'wager', title: 'Wager on the novel' }
  ]
});

let lesson = { id: LESSON_ID, type: 'lesson', title: 'Harbour Lights games', unit_id: 'unit_demo', pedagogical_mode: 'game', blocks: [], game: draftGame } as unknown as Lesson;


/** Wraps the real client so the preview can drop the network on purpose. */
let networkDown = false;
function droppable(client: GameClient): GameClient {
  return {
    ...client,
    send: (g, p, events) => (networkDown ? Promise.reject(Object.assign(new Error('Network request failed'), { code: 'network_error' })) : client.send(g, p, events))
  };
}

const mount = document.getElementById('mount')!;
const view = new URLSearchParams(location.search).get('view');
/** `?view=live-board` and `?view=live-phone&seat=AB`: live games on the dev fake room (games-live-preview.ts). */
const live = view === 'live-board' || view === 'live-phone';
if (live) (await import('./games-live-preview')).mountLivePreview(mount, view);

if (!live && view !== 'arcade') {
  const section = el('section', 'gm-preview');
  section.append(el('h1', '', 'Teacher: Game lesson build'));
  const editor = mountGameEditor({
    getLesson: () => lesson,
    emitLesson: (next) => {
      lesson = next;
    },
    classes: [{ id: CLASS_ID, name: 'Year 9 English' }],
    api: gameTeacherApi(LESSON_ID)
  });
  section.append(editor.root);
  mount.append(section);
}

if (!live && view !== 'editor') {
  const section = el('section', 'gm-preview');
  section.style.marginTop = '48px';
  section.append(el('h1', '', 'Student: the arcade'));
  const drop = el('label', 'gm-check');
  const dropBox = el('input');
  dropBox.type = 'checkbox';
  dropBox.addEventListener('change', () => {
    networkDown = dropBox.checked;
  });
  drop.append(dropBox, document.createTextNode(' Drop the network (sends fail; the solo queue keeps answers and retries)'));
  const host = el('div');
  section.append(drop, host);
  mount.append(section);
  const fallback = (): PublishedLesson =>
    ({
      lesson_id: LESSON_ID,
      title: 'Harbour Lights games',
      blocks: [],
      published_at: '2026-11-09T09:00:00.000Z',
      schema_version: 1,
      pedagogical_mode: 'game',
      game: { games: draftGame.games.map((g) => { try { return splitGame(g).public; } catch { return null; } }).filter(Boolean), version: 'preview' }
    }) as unknown as PublishedLesson;
  const published = await apiGet<PublishedLesson>(`/api/published/lessons/${LESSON_ID}`).catch(fallback);
  mountGameArcade(host, {
    lesson: published.game ? published : fallback(),
    classId: CLASS_ID,
    client: droppable(gameClient(LESSON_ID, CLASS_ID)),
    renderHero: (h) => {
      const hero = el('header', 'lesson-hero');
      hero.append(el('p', 'gm-eyebrow', 'Game'), el('h2', 'gm-arcade__title', published.title ?? 'Harbour Lights games'));
      h.append(hero);
    }
  });
}
