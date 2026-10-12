import test from 'node:test';
import assert from 'node:assert/strict';
import { manresaTimetable } from '../fixtures/manresa-timetable.js';
import { teachingEventsFromCurriculum } from '../../packages/design-kit/js/calendar/teaching-calendar.js';
import { createScheduledLessonHandler } from '../../netlify/functions/scheduled-lesson.mjs';
import { buildCurriculum } from '../../netlify/functions/curriculum.mjs';
const { createScheduleTimetableHandler } = await import('../../netlify/functions/schedule-timetable.mjs').catch(()=>({}));
const ISO='2026-10-12T00:00:00Z';
function setup() {
 const map=new Map([
 ['classes/c',{id:'c',type:'class',code:'11ENA6',title:'Year 12 English Advanced',subject_id:'eng',active_unit_ids:[]}],
 ['units/u',{id:'u',type:'unit',title:'New unit',subject_id:'eng',lesson_ids:[]}]]);
 const versions=new Map();
 const store={get:async(key,opts)=> { assert.equal(opts.consistency,'strong','mutable read must be strong');return map.get(key) ?? null;},
 getWithMetadata:async(key)=>map.has(key)?{data:structuredClone(map.get(key)),etag:String(versions.get(key)??0)}:null,
 setJSON:async(key,val,conditions={})=>{
  if((conditions.onlyIfNew&&map.has(key)) || (conditions.onlyIfMatch!==undefined&&String(versions.get(key)??0)!==conditions.onlyIfMatch))return {modified:false};
  map.set(key,val);versions.set(key,(versions.get(key)??0)+1);return {modified:true,etag:String(versions.get(key))};
 },list:async({prefix})=>({blobs:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})};
 assert.equal(typeof createScheduleTimetableHandler,'function','bulk scheduling endpoint exists');
 const handler=createScheduleTimetableHandler({env:{LIFE_HUB_PASSPHRASE_HASH:'configured',SESSION_SECRET:'s'.repeat(32)},verifySessionToken:token=>({valid:token==='ok'}),getContentStore:async()=>store});
 const body={unit_id:'u',start_date:'2026-10-12',end_date:'2026-10-23',timetable:manresaTimetable()};
 const req=(changes={},signed=true)=>new Request('https://api.example/api/classes/c/schedule-timetable',{method:'POST',headers:{'Content-Type':'application/json',...(signed?{cookie:'life_hub_session=ok'}:{})},body:JSON.stringify({...body,...changes})});
 return {map,store,handler,req};
}
test('empty unit creates eight editable drafts and nine periods of calendar time; retry preserves content',async()=>{
 const {map,handler,req}=setup(); const res=await handler(req()); assert.equal(res.status,200);
 const data=(await res.json()).data;
 assert.equal(data.lessons.length,8); assert.equal(data.unit.lesson_ids.length,8);
 assert.deepEqual(data.lessons.map(l=>l.blocks),Array(8).fill([]));
 const events=teachingEventsFromCurriculum(data);
 assert.equal(events.length,8); assert.equal(events[0].record.duration_min,53); assert.equal(events[1].record.duration_min,106);
 assert.equal(events[0].record.planning_status,'not_planned');
 assert.equal(events[0].record.room,'A0214');
 const id=data.lessons[0].id; map.get('lessons/'+id).blocks=[{id:'written',type:'rich_text',html:'Hello'}];
 const repeated=await handler(req()); assert.equal(repeated.status,200);
 assert.equal(map.get('units/u').lesson_ids.length,8);
 assert.equal(map.get('lessons/'+id).blocks[0].html,'Hello');
 assert.equal(map.get('classes/c').timetable.anchor_date,'2026-10-12');
});
test('omitted session does not shift the cycle and existing drafts are optional',async()=>{
 const {map,handler,req}=setup();
 map.set('lessons/existing',{id:'existing',unit_id:'u',sequence:1,title:'Already written',blocks:[{id:'b'}],status:'active'});
 map.get('units/u').lesson_ids=['existing'];
 const res=await handler(req({omitted_slots:['2026-10-12_1150'],use_existing:true})); assert.equal(res.status,200);
 const d=(await res.json()).data; assert.equal(d.scheduled_lessons.length,7);assert.equal(d.scheduled_lessons[0].lesson_id,'existing');assert.equal(d.scheduled_lessons[0].cycle_day,2);
});
test('partial failures retry using the same draft ids without overwriting written content',async()=>{
 const {map,store,handler,req}=setup(); const write=store.setJSON;let once=true;
 store.setJSON=async(key,val,conditions)=>{if(key.startsWith('scheduled_lessons/')&&once){once=false;throw new Error('interrupted');}return write(key,val,conditions);};
 assert.equal((await handler(req())).status,500);
 const draft=[...map.values()].find(v=>v.type==='lesson');assert.ok(draft);draft.blocks=[{id:'kept',text:'Written after failure'}];
 assert.equal((await handler(req())).status,200);
 assert.equal(map.get('units/u').lesson_ids.length,8);assert.equal(map.get('lessons/'+draft.id).blocks[0].id,'kept');
 assert.equal(new Set(map.get('units/u').lesson_ids.map(id=>map.get('lessons/'+id).sequence)).size,8);
});
test('auth, deleted parents, subject mismatch, invalid input and slot collisions write nothing',async()=>{
 for(const scenario of ['auth','deleted','subject','invalid','collision']){
  const {map,handler,req}=setup();
  if(scenario==='deleted')map.get('units/u').status='trashed';
  if(scenario==='subject')map.get('units/u').subject_id='math';
  if(scenario==='collision')map.set('scheduled_lessons/other',{id:'other',class_id:'c',unit_id:'other',lesson_id:'other',date:'2026-10-12',start_time:'11:30',end_time:'12:00'});
  const snapshot=()=>JSON.stringify([...map].filter(([key])=>!key.startsWith('locks/')));
  const before=snapshot();
  const res=await handler(req(scenario==='invalid'?{end_date:'2026-02-30'}:{},scenario!=='auth'));
  assert.ok(res.status>=400);assert.equal(snapshot(),before);
 }
});

test('concurrent different-unit requests cannot both own the same class session',async()=>{
 const {map,store,handler,req}=setup();map.set('units/v',{id:'v',type:'unit',title:'Other unit',subject_id:'eng',lesson_ids:[]});
 const write=store.setJSON;let entered=0,release;const barrier=new Promise(resolve=>release=resolve);
 store.setJSON=async(key,val,conditions)=>{
  if(key.startsWith('lessons/')){entered++;if(entered===1)setTimeout(()=>release(),20);await barrier;}
  return write(key,val,conditions);
 };
 const responses=await Promise.all([handler(req({end_date:'2026-10-12'})),handler(req({unit_id:'v',end_date:'2026-10-12'}))]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const owners=[map.get('units/u'),map.get('units/v')].filter(u=>u.lesson_ids.length);assert.equal(owners.length,1);
 assert.equal(map.get('lessons/'+owners[0].lesson_ids[0]).unit_id,owners[0].id);
});

test('moving a lesson start retains its 53 minute duration',async()=>{
 const {map,store,handler,req}=setup();const data=(await (await handler(req({end_date:'2026-10-12'}))).json()).data;
 const id=data.scheduled_lessons[0].id;
 const patch=createScheduledLessonHandler({env:{LIFE_HUB_PASSPHRASE_HASH:'configured',SESSION_SECRET:'s'.repeat(32)},verifySessionToken:()=>({valid:true}),getContentStore:async()=>store});
 const response=await patch(new Request('https://api.example/api/scheduled-lessons/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({start_time:'12:00'})}));
 assert.equal(response.status,200);assert.equal(map.get('scheduled_lessons/'+id).end_time,'12:53');
});

test('a physically removed unit or lesson cannot leave orphan calendar lessons',async()=>{
 for(const kind of ['units/','lessons/','classes/']) {
  const {map,store,handler,req}=setup();
  const result=(await (await handler(req({end_date:'2026-10-12'}))).json()).data;
  map.delete(kind+(kind==='units/'?'u':kind==='classes/'?'c':result.lessons[0].id));
  const curriculum=await buildCurriculum({...store,get:async(key)=>map.get(key) ?? null});
  assert.equal(curriculum.scheduled_lessons.length,0);
 }
});
