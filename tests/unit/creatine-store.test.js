import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCreatineSnapshot, CREATINE_INDEX_PATH } from '../../netlify/functions/_shared/creatine-store.mjs';
import { persistLogEntry, renderMarkdown } from '../../netlify/functions/_shared/persist-log.mjs';
const now = new Date('2026-10-10T18:00:00+11:00');
function clientFixture(){
 let next=0;const files=new Map([['central-node.md',{sha:'cn',content:"# Central Node\n\n## ⚡ Today's Status (Saturday 10 October 2026)\n\n**Nutrition:** untouched\n**Flags:** none\n\n## 🤖 Recent Agent Actions\n"}]]);const reads=[];
 return {files,reads,async resolveTree(){return {tree:[...files].map(([path,f])=>({path,sha:f.sha,type:'blob'}))};},async readBlob(sha){reads.push(sha);const file=[...files.values()].find(f=>f.sha===sha);if(!file)throw Error('missing');return {encoding:'base64',content:Buffer.from(file.content).toString('base64')};},async writeFile({path,content,sha}){if(files.has(path)&&files.get(path).sha!==sha)throw Object.assign(Error('conflict'),{code:'write_conflict'});const saved={content,sha:`sha${++next}`};files.set(path,saved);return {sha:saved.sha,commitSha:`commit${next}`};}};
}
const record=(id,grams,date='2026-10-10')=>({schema_version:1,id,type:'creatine',grams,dose_key:id,date,time:'08:00',created_at:'2026-10-10T08:00:00+11:00',updated_at:'2026-10-10T08:00:00+11:00',source:'test'});
const pathFor=r=>`data/nutrition/${r.date.slice(0,4)}/${r.date.slice(5,7)}/${r.date}-creatine-${r.dose_key}.md`;
test('confirmed additive doses and corrections sync todays CN from stored history',async()=>{
 const client=clientFixture();const a=record('a',7),b=record('b',5);
 for(const r of[a,b]){const result=await persistLogEntry(client,{record:r,path:pathFor(r),notes:'creatine',nowDateKey:'2026-10-10',now});assert.equal(result.centralNodeUpdated,true);}
 assert.match(client.files.get('central-node.md').content,/12 g logged today/);
 assert.match(client.files.get('central-node.md').content,/Nutrition:\*\* untouched/);
 const sha=client.files.get(pathFor(a)).sha;
 await persistLogEntry(client,{record:{...a,grams:3},path:pathFor(a),existingSha:sha,nowDateKey:'2026-10-10',now});
 assert.match(client.files.get('central-node.md').content,/8 g logged today/);
 assert.equal((client.files.get('central-node.md').content.match(/\*\*Creatine:\*\*/g)||[]).length,1);
});
test('snapshot verifies cached hashes, reads only changed logs and drops removed paths',async()=>{
 const client=clientFixture();const a=record('a',10);await client.writeFile({path:pathFor(a),content:renderMarkdown(a)});
 const first=await loadCreatineSnapshot(client,{date:'2026-10-10',now,persist:true});assert.equal(first.model.todayGrams,10);assert.ok(client.files.has(CREATINE_INDEX_PATH));
 client.reads.length=0;const second=await loadCreatineSnapshot(client,{date:'2026-10-10',now});assert.equal(second.model.todayGrams,10);assert.equal(client.reads.length,1);
 client.files.delete(pathFor(a));assert.equal((await loadCreatineSnapshot(client,{date:'2026-10-10',now})).model.todayGrams,0);
});
test('backdated logs revise current level without publishing a past-day total as todays intake',async()=>{
 const client=clientFixture();const result=await persistLogEntry(client,{record:record('past',20,'2026-10-09'),path:pathFor(record('past',20,'2026-10-09')),nowDateKey:'2026-10-10',now});assert.equal(result.centralNodeUpdated,true);assert.match(client.files.get('central-node.md').content,/2026-10-10 as of/);assert.match(client.files.get('central-node.md').content,/0 g logged today/);
});
test('failed source reads preserve intake but never claim CN was updated',async()=>{
 const client=clientFixture();const old=record('old',5);await client.writeFile({path:pathFor(old),content:renderMarkdown(old)});const original=client.readBlob;client.readBlob=async sha=>{if(sha===client.files.get(pathFor(old)).sha)throw Error('offline');return original.call(client,sha);};
 const r=record('new',10);const result=await persistLogEntry(client,{record:r,path:pathFor(r),nowDateKey:'2026-10-10',now});assert.equal(result.centralNodeUpdated,false);assert.ok(client.files.has(pathFor(r)));assert.doesNotMatch(client.files.get('central-node.md').content,/Creatine/);
});
test('a concurrent CN write is retried against the latest tree without losing another field',async()=>{
 const client=clientFixture();const write=client.writeFile.bind(client);let raced=false;
 client.writeFile=async input=>{
  if(input.path==='central-node.md'&&!raced){raced=true;const f=client.files.get(input.path);client.files.set(input.path,{sha:'raced',content:f.content.replace('**Flags:** none','**Flags:** new clinical context')});throw Object.assign(Error('conflict'),{code:'write_conflict'});}
  return write(input);
 };
 const dose=record('race',5);const result=await persistLogEntry(client,{record:dose,path:pathFor(dose),nowDateKey:'2026-10-10',now});
 assert.equal(result.centralNodeUpdated,true);assert.match(client.files.get('central-node.md').content,/new clinical context/);assert.match(client.files.get('central-node.md').content,/5 g logged today/);
});
test('non-meal nutrition mutations republish the remaining intake without changing Nutrition',async()=>{
 const client=clientFixture();const r=record('removed',10);await persistLogEntry(client,{record:r,path:pathFor(r),nowDateKey:'2026-10-10',now});client.files.delete(pathFor(r));
 const {syncCentralNodeAfterCreatineWrites}=await import('../../netlify/functions/_shared/persist-log.mjs');
 const result=await syncCentralNodeAfterCreatineWrites(client,{date:'2026-10-10',now});assert.equal(result.updated,true);
 assert.match(client.files.get('central-node.md').content,/0 g logged today/);assert.match(client.files.get('central-node.md').content,/Nutrition:\*\* untouched/);
});
test('agent context never exposes keys belonging to deleted doses',async()=>{
 const {creatineContext}=await import('../../netlify/functions/_shared/creatine-store.mjs');
 const client=clientFixture();const snapshot=await loadCreatineSnapshot(client,{date:'2026-10-10',now});
 snapshot.events=[{record:{...record('live',5)}},{record:{...record('gone',5),deleted_at:'2026-10-10'}}];
 const text=creatineContext(snapshot);assert.match(text,/keys for today: live\./);assert.doesNotMatch(text,/gone/);
});
