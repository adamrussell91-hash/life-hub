import { draftLessonKey, scheduledLessonKey, setJSON, slugify, SCHEDULED_LESSON_PREFIX, unitKey } from './teaching-blobs.mjs';
import { listBlobKeys, isIndexKey } from './blobs-list.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { withTimetableLocks, updateTimetableParent } from './teaching-timetable-lock.mjs';

const read = (store,key) => store.get(key,{type:'json',consistency:'strong'});
const fail = (status,code,message) => { throw Object.assign(new Error(message),{status,code}); };
const isBlank = lesson => !Array.isArray(lesson?.blocks) || lesson.blocks.length===0;

async function liveRows(store) {
  const keys=(await listBlobKeys(store,SCHEDULED_LESSON_PREFIX)).filter(key=>!isIndexKey(key));
  return (await Promise.all(keys.map(key=>read(store,key)))).filter(row=>row && !isDeletedRecord(row));
}

/**
 * One lesson taught over several slots: point this slot at another lesson (lesson_id),
 * or give it a fresh blank lesson of its own again (lesson_id null). The slot keeps its
 * date, time and period. A blank draft the slot leaves behind, with no other slot, goes
 * to Trash so the unit plan does not keep an empty lesson. A written lesson is kept.
 */
export async function linkScheduledLesson(store,id,body) {
  const row=await read(store,scheduledLessonKey(id));
  if(!row || isDeletedRecord(row)) fail(404,'not_found','Scheduled lesson not found');
  if(body.lesson_id!==null && (typeof body.lesson_id!=='string' || !body.lesson_id.trim())) fail(400,'validation_error','lesson_id must be a lesson id or null');
  return withTimetableLocks(store,['locks/teaching-timetable/class/'+row.class_id],async()=>{
    const fresh=await read(store,scheduledLessonKey(id));
    if(!fresh || isDeletedRecord(fresh)) fail(404,'not_found','Scheduled lesson not found');
    const previous=await read(store,draftLessonKey(fresh.lesson_id));
    const now=new Date().toISOString();
    let lesson;
    if(body.lesson_id===null) {
      const unit=await read(store,unitKey(fresh.unit_id));
      if(!unit || isDeletedRecord(unit)) fail(404,'not_found','Unit not found');
      const siblings=(await Promise.all((unit.lesson_ids ?? []).map(lessonId=>read(store,draftLessonKey(lessonId))))).filter(Boolean);
      const sequence=Math.max(0,...siblings.map(l=>Number(l.sequence)||0))+1;
      const title='Lesson ' + sequence + ' — ' + unit.title;
      lesson={id:'lesson_split_'+id+'_'+Date.now().toString(36),type:'lesson',title,slug:slugify(title),unit_id:unit.id,sequence,blocks:[],pedagogical_mode:'direct',status:'active',created_at:now,updated_at:now,schema_version:1};
      await setJSON(store,draftLessonKey(lesson.id),lesson);
      await updateTimetableParent(store,unitKey(unit.id),current=>{
        if(!current || isDeletedRecord(current)) fail(409,'conflict','The unit was removed.');
        return {...current,lesson_ids:[...new Set([...(current.lesson_ids ?? []),lesson.id])],updated_at:now};
      });
    } else {
      const lessonId=body.lesson_id.trim();
      if(lessonId===fresh.lesson_id) fail(400,'validation_error','This slot already teaches that lesson.');
      lesson=await read(store,draftLessonKey(lessonId));
      if(!lesson || isDeletedRecord(lesson)) fail(404,'not_found','Lesson not found');
    }
    const next={...fresh,lesson_id:lesson.id,unit_id:typeof lesson.unit_id==='string' && lesson.unit_id ? lesson.unit_id : fresh.unit_id,updated_at:now};
    await setJSON(store,scheduledLessonKey(id),next);
    let trashed_lesson_id;
    if(previous && !isDeletedRecord(previous) && isBlank(previous)) {
      const stillUsed=(await liveRows(store)).some(other=>other.id!==id && other.lesson_id===previous.id);
      if(!stillUsed) {
        await setJSON(store,draftLessonKey(previous.id),{...previous,status:'trashed',previous_status:previous.status==='archived' ? 'archived' : 'active',trashed_at:now,trash_reason:'Slot now teaches another lesson',updated_at:now});
        trashed_lesson_id=previous.id;
      }
    }
    return {scheduled_lesson:next,lesson,...(trashed_lesson_id ? {trashed_lesson_id} : {})};
  });
}
