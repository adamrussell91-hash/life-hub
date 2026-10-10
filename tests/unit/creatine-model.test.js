import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreatineModel } from '../../apps/life/js/core/creatine.js';
const now = new Date('2026-10-10T18:00:00+11:00');
const build = (events, extra = {}) => buildCreatineModel({ events, date: '2026-10-10', now, ...extra });
const dose = (id, grams, date = '2026-10-10', time = '08:00') => ({record:{id,type:'creatine',date,time,grams}});
test('empty history reports baseline and a default gentle routine without measured muscle grams', () => {
 const m=build([]); assert.equal(m.todayGrams,0); assert.equal(m.phase,'Not started'); assert.equal(m.dailyGrams,5); assert.equal(m.level.low,0); assert.equal(m.level.high,0); assert.ok(m.eta.low>=18 && m.eta.high<=35); assert.equal(m.measured,false);
});
test('embedded and separate doses add; duplicate identities, deleted and future intakes do not', () => {
 const m=build([{record:{id:'meal',type:'meal',date:'2026-10-10',time:'08:00',creatine_g:7}},dose('d',5),dose('d',5),dose('future',30,'2026-10-11'),{record:{...dose('gone',12).record,deleted_at:'2026-10-10'}}]); assert.equal(m.todayGrams,12); assert.ok(m.pendingGrams>0); assert.equal(m.doses.length,2);
});
test('a corrected identity is replaced, not counted twice',()=>{assert.equal(build([dose('a',10),dose('a',3),dose('b',5)]).todayGrams,8);});
test('history errors suppress ETA rather than treating unavailable history as missed intake',()=>{const m=build([dose('a',10)],{history:{loading:false,error:true}}); assert.equal(m.eta,null); assert.equal(m.confidence,'incomplete');});
test('paused plan removes dose recommendations and loading ETA',()=>{const m=build([{record:{type:'creatine_plan',date:'2026-10-09',mode:'paused',daily_g:0,maintenance_g:5}}]);assert.equal(m.dailyGrams,0); assert.equal(m.eta,null);assert.equal(m.phase,'Paused');});
test('rapid plan forecasts sooner without interpreting oral grams as retained muscle grams',()=>{const m=build([{record:{type:'creatine_plan',date:'2026-10-10',mode:'loading',daily_g:20,maintenance_g:5}}]);assert.ok(m.eta.low>=4 && m.eta.high<=9);assert.equal(m.dailyGrams,20);});
test('missed days gradually drain supplemental loading toward baseline and a late append rebuilds it',()=>{
 const history=[{record:{type:'creatine_plan',date:'2026-09-01',baseline_date:'2026-09-01',baseline:1,mode:'maintenance',daily_g:5,maintenance_g:5}}]; const before=build(history);assert.ok(before.level.high<0.1);const after=build([...history,dose('backdate',20,'2026-10-09')]);assert.ok(after.level.high>before.level.high);assert.equal(after.todayGrams,0);
});
test('a maintained loaded baseline remains in target and stops increasing',()=>{const m=build([{record:{type:'creatine_plan',date:'2026-10-09',baseline_date:'2026-10-09',baseline:1,mode:'maintenance',daily_g:5,maintenance_g:5}},dose('y',5,'2026-10-09'),dose('t',5)]);assert.equal(m.phase,'Maintenance');assert.equal(m.eta.low,0);assert.ok(m.level.high<=1);assert.equal(m.dailyGrams,5);});
test('Sydney clock excludes a later same-day dose and progresses the contribution without extra logs',()=>{const events=[dose('morning',10,'2026-10-10','08:00'),dose('evening',5,'2026-10-10','20:00')];const early=build(events,{now:new Date('2026-10-10T08:00:00+11:00')});const late=build(events);assert.equal(late.todayGrams,10);assert.ok(late.level.high>early.level.high);assert.ok(late.pendingGrams<early.pendingGrams);});
test('3–5 g gradual routines share the approximate four-week loading envelope',()=>{
 for(const grams of[3,4,5]){
  const plan={record:{type:'creatine_plan',date:'2026-10-10',daily_g:grams,maintenance_g:grams,mode:'loading'}};
  const model=build([plan]);assert.ok(model.eta.low>=18);assert.ok(model.eta.high<=35,`${grams} g/day forecast ${model.eta.high}`);
 }
});
