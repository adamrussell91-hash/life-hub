import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveAlchemySources} from '../../netlify/functions/_shared/alchemy-analysis.mjs';
import {memoryAlchemyStore} from '../helpers/alchemy-store.js';
test('bounded cached retrieval checks current page liveness before exposing excerpts',async()=>{
 const store=memoryAlchemyStore();let manifestCalls=0,live=true;
 const data={ 'manifest.json':[{id:'one',title:'Scaffolding',excerpt:'Model the process'},{id:'two',title:'Scaffolding',excerpt:'Old process'}], 'pages/one.json':{id:'one',title:'Scaffolding',body:'Model before independent work'},'pages/two.json':{id:'two',status:'trashed',body:'Deleted evidence'}};
 const fetchImpl=async url=>{const path=decodeURIComponent(String(url).split('/contents/')[1]);if(path==='manifest.json')manifestCalls++;const page=path==='pages/one.json'&&!live?{...data[path],status:'trashed'}:data[path];return new Response(JSON.stringify({sha:'file',encoding:'base64',content:Buffer.from(JSON.stringify(page)).toString('base64')}),{headers:{'content-type':'application/json'}});};
 const options={store,env:{GITHUB_TOKEN:'test'},fetchImpl,query:'Scaffolding',signal:new AbortController().signal};
 const first=await retrieveAlchemySources(options);assert.deepEqual(first.map(s=>s.id),['one']);live=false;assert.deepEqual(await retrieveAlchemySources(options),[]);assert.equal(manifestCalls,1);
});
