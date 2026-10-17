import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';
import { addUnitNotes, removeUnitNote, readUnitNotes, shortlistNotes } from '../../netlify/functions/_shared/alchemy-unit-notes.mjs';
const { createAlchemyUnitNotesHandler } = await import('../../netlify/functions/alchemy-unit-notes.mjs');

test('the shelf comes first, removed notes stay out, and archive candidates fill the rest',async()=>{
 const store=memoryAlchemyStore();
 await addUnitNotes(store,'u',[{id:'a',title:'Question stems',why:'Sharper questions'},{id:'b',title:'Frost imagery'}]);
 await removeUnitNote(store,'u','b');
 await addUnitNotes(store,'u',[{id:'b',title:'Frost imagery'}]);
 const shelf=await readUnitNotes(store,'u');assert.deepEqual(shelf.notes.map(n=>n.id),['a']);
 const index=[{id:'a',title:'Question stems',excerpt:''},{id:'b',title:'Frost imagery poem',excerpt:''},{id:'c',title:'Poem tone and imagery',excerpt:'tone'},{id:'gone',title:'Deleted poem note',excerpt:''}];
 const list=shortlistNotes({index:index.filter(n=>n.id!=='gone'),unitNotes:shelf,query:'poem tone imagery'});
 assert.deepEqual(list.map(n=>[n.id,n.shelf]),[['a','unit'],['c','archive']]);
});

test('gather keeps only notes Ann was shown, with her reasons',async()=>{
 const store=memoryAlchemyStore();store.rows.set('units/u',{data:{id:'u',title:'Poetry: tone and voice',blocks:[]},etag:'0'});
 const handler=createAlchemyUnitNotesHandler({env:{LIFE_HUB_PASSPHRASE_HASH:'configured',SESSION_SECRET:'s'.repeat(32),ANTHROPIC_API_KEY:'test'},getContentStore:async()=>store,verifySessionToken:t=>({valid:t==='ok'}),
  index:async()=>[{id:'n1',title:'Tone in poetry',excerpt:'voice and tone'},{id:'n2',title:'Gardening',excerpt:''}],
  complete:async()=>({unitNotes:[{id:'n1',why:'Shows how to question tone.'},{id:'invented',why:'x'}]})});
 const post=body=>handler(new Request('https://api.example/api/alchemy-unit-notes',{method:'POST',headers:{'content-type':'application/json',cookie:'life_hub_session=ok'},body:JSON.stringify(body)}));
 const r=await post({unit:'u',action:'gather'});assert.equal(r.status,200);const d=(await r.json()).data;assert.equal(d.added,1);assert.deepEqual(d.notes.map(n=>[n.id,n.why]),[['n1','Shows how to question tone.']]);
 const removed=await post({unit:'u',remove:'n1'});assert.deepEqual((await removed.json()).data.notes,[]);
 const list=await handler(new Request('https://api.example/api/alchemy-unit-notes?unit=u',{headers:{cookie:'life_hub_session=ok'}}));assert.deepEqual((await list.json()).data.notes,[]);
});
