const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3,5));
export function prepareScheduledLessonPatch(existing,patch) {
  const next={...patch};
  if(patch.start_time!==undefined) {
    if(patch.start_time!==null && !TIME.test(patch.start_time)) throw new Error('Start time must be HH:MM.');
    if(patch.start_time===null) next.end_time=undefined;
    else if(patch.end_time===undefined && TIME.test(existing.start_time) && TIME.test(existing.end_time) && existing.end_time>existing.start_time) {
      const end=minutes(patch.start_time)+minutes(existing.end_time)-minutes(existing.start_time);
      if(end>=1440)throw new Error('The lesson must end on the same day.');
      next.end_time=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
    }
  }
  if(next.end_time!==undefined && (!TIME.test(next.end_time) || !TIME.test(next.start_time ?? existing.start_time) || next.end_time <= (next.start_time ?? existing.start_time))) throw new Error('End time must be later than start time.');
  return next;
}
