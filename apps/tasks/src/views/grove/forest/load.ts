/** Loads one year's forest: finished tasks, projects and the private 2026 history, as trees and earned animals. */
import { applyGroveHistory } from '@/domain/grove/private-history';
import { groveCompletions } from '@/domain/grove/plan';
import { groveBooks } from '@/domain/grove/books';
import { groveTerms } from '@/domain/grove/calendar';
import { toHubDateKey } from '@/domain/queries';
import { tasksApi } from '@/services/client-api';
import { forestAnimals, forestHistory } from './data';
import { forestEvents } from '@/domain/grove/forest-wildlife';

/** Throws when the task list cannot load (signed out, offline); everything else is optional. */
export async function loadForest(year: number, now: Date) {
  const [tasks, prefs, profile, books, projects, programs] = await Promise.all([
    tasksApi.listTasks({ includeCachedOnly: false }),
    tasksApi.getHubPrefs().catch(() => null),
    tasksApi.getPlanningProfile().catch(() => null),
    groveBooks().catch(() => []),
    tasksApi.listProjects().catch(() => []),
    tasksApi.listPrograms().catch(() => [])
  ]);
  const inputs = applyGroveHistory({ history: prefs?.grove_history, tasks, terms: groveTerms({ hubPrefs: prefs, planningProfile: profile }), books, now });
  const { completions } = groveCompletions(inputs.tasks);
  return {
    history: forestHistory(completions, year),
    animals: forestAnimals(completions, inputs.terms, inputs.books, year, toHubDateKey(now), forestEvents(projects, programs, inputs.events))
  };
}
