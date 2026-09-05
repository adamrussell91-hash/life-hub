import { addDays, startOfDay, tasksForDay, toDateKey } from './clare-dates.mjs';

function levelFromLoad(taskCount, minutes) {
  if (taskCount === 0 && minutes === 0) return 'free';
  if (taskCount >= 5 || minutes >= 360) return 'slammed';
  if (taskCount >= 3 || minutes >= 240) return 'busy';
  if (taskCount >= 1 || minutes >= 60) return 'light';
  return 'free';
}

function effort(task) {
  return Number(task.estimated_duration) || 45;
}

export function buildDayCapacity(tasks, day) {
  const dayTasks = tasksForDay(tasks, day);
  const estimated_minutes = dayTasks.reduce((sum, task) => sum + effort(task), 0);
  return {
    date_key: toDateKey(day),
    weekday: day.toLocaleDateString(undefined, { weekday: 'long' }),
    level: levelFromLoad(dayTasks.length, estimated_minutes),
    open_task_count: dayTasks.length,
    estimated_minutes
  };
}

function overallLevel(days) {
  if (days.some(day => day.level === 'slammed')) return 'slammed';
  if (days.filter(day => day.level === 'busy').length >= 2) return 'busy';
  if (days.some(day => day.level === 'busy' || day.level === 'light')) return 'light';
  return 'free';
}

export function capacityHeadlines(days) {
  const headlines = [];
  const slammed = days.filter(day => day.level === 'slammed');
  if (slammed.length) {
    headlines.push(`Slammed through ${slammed[slammed.length - 1].weekday}`);
  }

  const busyRun = [];
  for (const day of days) {
    if (day.level === 'busy' || day.level === 'slammed') busyRun.push(day);
    else if (busyRun.length) break;
  }
  if (busyRun.length >= 2 && !slammed.length) {
    headlines.push(`Busy until ${busyRun[busyRun.length - 1].weekday}`);
  }

  for (const day of days) {
    if (day.weekday !== 'Saturday' && day.weekday !== 'Sunday') continue;
    if (day.level === 'free') headlines.push(`Free ${day.weekday} afternoon`);
    else if (day.level === 'light') headlines.push(`${day.weekday} looks light`);
  }

  if (!headlines.length) {
    const nextBusy = days.find(day => day.level === 'busy' || day.level === 'slammed');
    headlines.push(nextBusy ? `${nextBusy.weekday} is the pinch` : 'Clear horizon for the next stretch');
  }
  return headlines.slice(0, 3);
}

export function buildCapacitySnapshot(tasks, from = new Date(), horizonDays = 14) {
  const start = startOfDay(from);
  const days = [];
  for (let i = 0; i < horizonDays; i += 1) {
    days.push(buildDayCapacity(tasks, addDays(start, i)));
  }
  return {
    generated_at: new Date().toISOString(),
    horizon_days: horizonDays,
    days,
    headlines: capacityHeadlines(days),
    overall: overallLevel(days.slice(0, 7))
  };
}

export function toCoreyPublicView(snapshot) {
  return {
    generated_at: snapshot.generated_at,
    headlines: snapshot.headlines,
    overall: snapshot.overall,
    days: snapshot.days.map(day => ({
      date_key: day.date_key,
      weekday: day.weekday,
      level: day.level
    }))
  };
}
