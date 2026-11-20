import { apiGet } from '@/api/client';
import { el } from '@/quiz/dom';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { mountGameArcade } from '@/games/arcade';
import { gameClient, gameTeacherApi } from '@/games/api';
import type { Game } from '@/games/core/schema';
import { openFleetControlRoom } from '@/games/kinds/fleet-week/control-room';
import '@/games/kinds';
import '../styles/app.css';

/**
 * Fleet week on one page per player, for the browser test
 * (tests/browser/fleet-week.spec.ts) and a local walk:
 *   /fleet-week.html?view=control&lesson=…&class=…   the teacher's control room
 *   /fleet-week.html?view=phone&lesson=…&class=…     a student's arcade (initials, then Open Fleet week)
 * The lesson is read from /api/published/lessons/:lesson; play goes through
 * /api/published/game/:lesson and /api/lessons/:lesson/game.
 */

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'phone';
const lessonId = params.get('lesson') ?? '';
const classId = params.get('class') ?? '';
const mount = document.getElementById('mount')!;

try {
  const published = await apiGet<PublishedLesson>(`/api/published/lessons/${encodeURIComponent(lessonId)}`);
  if (view === 'control') {
    const game = (published.game as { games?: Game[] } | undefined)?.games?.find((g) => g.kind === 'fleet_week');
    if (!game) throw new Error('This lesson has no Fleet week game.');
    mount.append(el('h1', '', `Teacher: ${published.title ?? 'Fleet week'}`));
    openFleetControlRoom(document.body, {
      lessonId,
      game,
      classes: [{ id: classId, name: params.get('class_name') ?? 'The class' }],
      classId,
      api: gameTeacherApi(lessonId).fleet ?? null
    });
  } else {
    const host = el('div');
    mount.append(host);
    mountGameArcade(host, {
      lesson: published,
      classId,
      client: gameClient(lessonId, classId),
      renderHero: (h) => {
        const hero = el('header', 'lesson-hero');
        hero.append(el('p', 'gm-eyebrow', 'Game'), el('h2', 'gm-arcade__title', published.title ?? 'Fleet week'));
        h.append(hero);
      }
    });
  }
} catch (e) {
  mount.append(el('p', 'gm-err', e instanceof Error ? e.message : 'The lesson didn’t load.'));
}
