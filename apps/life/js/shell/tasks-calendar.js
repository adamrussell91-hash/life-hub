const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function tasksEventsFromTasks(tasks) {
  return (tasks ?? [])
    .filter(task =>
      task &&
      typeof task.id === 'string' &&
      DATE_KEY.test(task.due_date) &&
      task.status !== 'done' &&
      task.status !== 'dead'
    )
    .map(task => ({
      path: `tasks:${task.id}`,
      record: {
        type: 'task',
        id: task.id,
        date: task.due_date,
        title: typeof task.title === 'string' && task.title ? task.title : task.id,
        status: typeof task.status === 'string' ? task.status : undefined
      },
      body: ''
    }));
}
