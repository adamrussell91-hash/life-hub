export function topOpenTasks(tasks, limit = 3) {
  const open = (Array.isArray(tasks) ? tasks : []).filter(task => task?.status !== 'done');
  return [...open]
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1;
    })
    .slice(0, limit);
}

export function formatDueBadge(dueDate, { today } = {}) {
  if (!dueDate) return '';
  if (today && dueDate === today) return 'Today';
  if (today) {
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (dueDate === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow';
  }
  const [, month, day] = dueDate.split('-');
  return `${day}/${month}`;
}
