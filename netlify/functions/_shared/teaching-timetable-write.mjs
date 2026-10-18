import { createHash } from 'node:crypto';
import { generateTimetableSessions, validateTimetable, sessionKey } from '../../../apps/teaching/src/schedule/timetable.js';
import { classKey, unitKey, draftLessonKey, scheduledLessonKey, setJSON, slugify, SCHEDULED_LESSON_PREFIX } from './teaching-blobs.mjs';
import { listBlobKeys, isIndexKey } from './blobs-list.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { withTimetableLocks, updateTimetableParent } from './teaching-timetable-lock.mjs';

const read = (store,key) => store.get(key,{type:'json',consistency:'strong'});
const fail = (status,code,message) => { throw Object.assign(new Error(message),{status,code}); };
const token = (classId,slot) => createHash('sha256').update(classId + ':' + sessionKey(slot)).digest('hex').slice(0,24);
const minutes = t => Number(t.slice(0,2))*60+Number(t.slice(3,5));

/** Deterministic slot/draft IDs make a repeated or interrupted request recoverable. */
export async function scheduleTimetable(store,classId,body) {
  // Validate and reject missing/deleted parents before claiming any locks.
  const cls=await read(store,classKey(classId));
  const unit=typeof body.unit_id==='string' ? await read(store,unitKey(body.unit_id)) : null;
  if(!cls || isDeletedRecord(cls) || !unit || isDeletedRecord(unit)) fail(404,'not_found','Class or unit not found.');
  try { generateTimetableSessions(body.timetable ?? cls.timetable,body.start_date,body.end_date); }
  catch(error) { fail(400,'validation_error',error.message); }
  return withTimetableLocks(store,['locks/teaching-timetable/class/'+classId,'locks/teaching-timetable/unit/'+unit.id],()=>writeTimetable(store,classId,body));
}

async function writeTimetable(store,classId,body) {
  const cls=await read(store,classKey(classId));
  const unit=typeof body.unit_id==='string' ? await read(store,unitKey(body.unit_id)) : null;
  if(!cls || isDeletedRecord(cls)) fail(404,'not_found','Class not found.');
  if(!unit || isDeletedRecord(unit)) fail(404,'not_found','Unit not found.');
  if(unit.kind==='program') fail(400,'program_not_schedulable',"Programs aren't scheduled into classes.");
  if(unit.subject_id!==cls.subject_id) fail(400,'subject_mismatch','Unit subject does not match class subject.');
  let timetable, sessions;
  try {
    timetable=validateTimetable(body.timetable ?? cls.timetable);
    sessions=generateTimetableSessions(timetable,body.start_date,body.end_date);
  } catch(error) { fail(400,'validation_error',error.message); }
  if(body.use_existing!==undefined && typeof body.use_existing!=='boolean') fail(400,'validation_error','Choose whether to use existing lessons.');
  const omitted=body.omitted_slots ?? [];
  if(!Array.isArray(omitted) || omitted.some(key=>typeof key!=='string' || !sessions.some(s=>sessionKey(s)===key))) fail(400,'validation_error','Omitted sessions must belong to this preview.');
  sessions=sessions.filter(s=>!omitted.includes(sessionKey(s)));
  if(!sessions.length || sessions.length>500) fail(400,'validation_error','Select between 1 and 500 sessions.');
  const keys=(await listBlobKeys(store,SCHEDULED_LESSON_PREFIX)).filter(key=>!isIndexKey(key));
  const existing=(await Promise.all(keys.map(key=>read(store,key)))).filter(row=>row && row.class_id===classId);
  const used=new Set(existing.filter(row=>!isDeletedRecord(row)).map(row=>row.lesson_id));
  const unitLessons=(await Promise.all((unit.lesson_ids ?? []).map(id=>read(store,draftLessonKey(id)))))
    .filter(row=>row && !isDeletedRecord(row) && row.unit_id===unit.id);
  const available=body.use_existing ? unitLessons.filter(l=>!used.has(l.id)).sort((a,b)=>a.sequence-b.sequence) : [];
  let sequence=Math.max(0,...unitLessons.map(l=>Number(l.sequence)||0));
  let order=Math.max(0,...existing.map(r=>Number(r.schedule_order)||0));
  const planned=[];
  // Check the whole request before writing any drafts or class configuration.
  for(const slot of sessions) {
    const suffix=token(classId,slot), id='timetable_'+suffix;
    const saved=await read(store,scheduledLessonKey(id));
    if(saved && (isDeletedRecord(saved)||saved.unit_id!==unit.id||saved.date!==slot.date||saved.start_time!==slot.start_time)) fail(409,'conflict','A session already occupies this teaching time. Review the calendar.');
    const clash=existing.find(row=>!isDeletedRecord(row) && row.id!==id && row.date===slot.date &&
      (!row.start_time || (minutes(row.start_time)<minutes(slot.end_time) &&
        (row.end_time ? minutes(row.end_time) : minutes(row.start_time)+60)>minutes(slot.start_time))));
    if(clash) fail(409,'conflict','This class already has a lesson at ' + slot.date + ' ' + slot.start_time + '.');
    let lesson;
    if(saved) {
      lesson=await read(store,draftLessonKey(saved.lesson_id));
      if(!lesson || isDeletedRecord(lesson)) fail(409,'conflict','An existing session points to a removed lesson. Review the calendar.');
    } else {
      // A draft can already exist after an interrupted write; never overwrite it.
      lesson=await read(store,draftLessonKey('lesson_timetable_'+suffix));
      if(lesson && (isDeletedRecord(lesson)||lesson.unit_id!==unit.id)) fail(409,'conflict','A draft at this teaching time belongs to another unit or was removed.');
      lesson=lesson ?? available.shift();
    }
    const now=new Date().toISOString();
    const create=!lesson;
    if(create) {
      const title='Lesson ' + (++sequence) + ' — ' + unit.title;
      lesson={id:'lesson_timetable_'+suffix,type:'lesson',title,slug:slugify(title),unit_id:unit.id,sequence,blocks:[],pedagogical_mode:'direct',status:'active',created_at:now,updated_at:now,schema_version:1};
    }
    sequence=Math.max(sequence,Number(lesson.sequence)||0);
    const scheduled=saved ?? {id,type:'scheduled_lesson',class_id:classId,unit_id:unit.id,lesson_id:lesson.id,...slot,schedule_order:++order,delivery_status:'planned',created_at:now,updated_at:now,schema_version:1};
    planned.push({lesson,scheduled,create,saved:Boolean(saved)});
  }
  for(const item of planned) {
    if(item.create) {
      const created=await store.setJSON(draftLessonKey(item.lesson.id),item.lesson,{onlyIfNew:true});
      if(!created?.modified) fail(409,'conflict','A lesson changed during scheduling. Retry to resume safely.');
    }
    if(!item.saved) {
      const created=await store.setJSON(scheduledLessonKey(item.scheduled.id),item.scheduled,{onlyIfNew:true});
      if(!created?.modified) fail(409,'conflict','A calendar session changed during scheduling. Retry to resume safely.');
    }
  }
  // Read mutable indices strongly, including after partial retries.
  const now=new Date().toISOString();
  const updatedUnit=await updateTimetableParent(store,unitKey(unit.id),fresh=>{
    if(!fresh || isDeletedRecord(fresh)) fail(409,'conflict','The unit was removed during scheduling.');
    return {...fresh,lesson_ids:[...new Set([...(fresh.lesson_ids ?? []),...planned.map(p=>p.lesson.id)])],updated_at:now};
  });
  const updatedClass=await updateTimetableParent(store,classKey(classId),fresh=>{
    if(!fresh || isDeletedRecord(fresh)) fail(409,'conflict','The class was removed during scheduling.');
    return {...fresh,timetable,active_unit_ids:[...new Set([...(fresh.active_unit_ids ?? []),unit.id])],current_unit_id:fresh.current_unit_id ?? unit.id,updated_at:now};
  });
  return {class:updatedClass,unit:updatedUnit,lessons:planned.map(p=>p.lesson),scheduled_lessons:planned.map(p=>p.scheduled)};
}
