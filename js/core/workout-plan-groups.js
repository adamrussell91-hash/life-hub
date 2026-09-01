/** Turn flat workout exercises into grouped blocks for plan cards. */

function exerciseSets(exercise) {
  return Array.isArray(exercise?.sets) ? exercise.sets : [];
}

export function groupWorkoutPlanExercises(exercises = []) {
  const list = Array.isArray(exercises) ? exercises : [];
  const blocks = [];
  const seenGroups = new Set();

  for (let index = 0; index < list.length; index += 1) {
    const exercise = list[index];
    const group = exercise?.superset_group;

    if (group != null && !seenGroups.has(group)) {
      seenGroups.add(group);
      const members = [];
      let label = null;
      for (let j = index; j < list.length; j += 1) {
        if (list[j]?.superset_group !== group) continue;
        if (!label && typeof list[j].superset_label === 'string' && list[j].superset_label.trim()) {
          label = list[j].superset_label.trim();
        }
        members.push(list[j]);
      }
      blocks.push({
        kind: members.length > 1 ? 'superset' : 'single',
        label,
        exercises: members
      });
      continue;
    }

    if (group != null && seenGroups.has(group)) continue;

    blocks.push({
      kind: exercise?.between_sets?.name ? 'between' : 'single',
      label: null,
      exercises: [exercise]
    });
  }

  return blocks;
}

export function formatSupersetBlockLabel(block, fallbackIndex = 0) {
  if (typeof block?.label === 'string' && block.label.trim()) return block.label.trim();
  if (block?.kind === 'between') return 'Between sets';
  if (block?.kind === 'superset') return `Superset ${fallbackIndex + 1}`;
  return '';
}

export function exerciseHasSetTargets(exercise) {
  return exerciseSets(exercise).length > 0;
}
