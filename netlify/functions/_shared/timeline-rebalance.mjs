/** Offline twin of the timeline_rebalance stub for the Netlify dump path. */
const VISUAL = [
  { id: 'h3', from: '2026-10-23', due: '2026-10-30', why: 'Draft procedures after marking is back' },
  { id: 'u3', from: '2026-10-23', due: '2026-10-27', why: 'Coaching still lands before the heat' },
  { id: 'x4', from: '2026-10-22', due: '2026-10-29', why: 'Advisory prep after the heat' }
];

function addDay(key, days) {
  const ms = Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

function empty(voice, agent) {
  return { voice, proposals: [], questions: [], notes: [], toolkit: null, mutations: [], agent };
}

export function hammondRebalanceResult(tasks = [], projects = [], agent = 'hammond') {
  if (agent !== 'hammond') {
    return empty('Timeline rebalance belongs to Hammond. I am not moving dates.', agent);
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visual = VISUAL.every((row) => byId.get(row.id)?.due_date === row.from);
  if (visual) {
    return {
      voice: 'Hammond suggests 3 changes. Clears T4 W2 · nothing moves into a wall · no hard deadlines move',
      proposals: [],
      questions: [],
      notes: [],
      toolkit: null,
      mutations: VISUAL.map((row) => ({
        kind: 'task_update',
        task_id: row.id,
        patch: { due_date: row.due },
        summary: row.why
      })),
      agent
    };
  }

  const walls = [];
  for (const item of [...projects, ...tasks]) {
    const wall = item?.life_wall;
    if (wall?.starts_on && wall?.ends_on) walls.push(wall);
  }
  const mutations = [];
  for (const task of tasks) {
    if (!task?.due_date || task.status === 'done' || task.status === 'dead' || task.marking) continue;
    const wall = walls.find((item) => task.due_date >= item.starts_on && task.due_date <= item.ends_on);
    if (!wall) continue;
    const hard = task.priority === 'urgent';
    mutations.push({
      kind: 'task_update',
      task_id: task.id,
      patch: { due_date: addDay(wall.ends_on, 1) },
      summary: hard ? `Hard due date: move ${task.title} out of the wall` : `Move ${task.title} out of the wall`
    });
  }
  const count = mutations.length;
  const hardMoved = mutations.some((mutation) => String(mutation.summary).startsWith('Hard due date'));
  return {
    voice: count
      ? `Hammond suggests ${count} change${count === 1 ? '' : 's'}. nothing moves into a wall · ${hardMoved ? 'a hard deadline would move' : 'no hard deadlines move'}`
      : 'Nothing to move. The window already stays out of walls and under capacity.',
    proposals: [],
    questions: [],
    notes: [],
    toolkit: null,
    mutations,
    agent
  };
}
