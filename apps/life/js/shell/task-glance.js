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
