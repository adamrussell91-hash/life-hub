import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHubPrefsRecord,mergeHubPrefsPatch} from '../../netlify/functions/_shared/hub-prefs-agent.mjs';
const history={schema_version:1,years:[]};
test('ordinary preference and agent patches preserve private Grove history',()=>{assert.deepEqual(parseHubPrefsRecord({grove_history:history}).grove_history,history);assert.deepEqual(mergeHubPrefsPatch({grove_history:history},{timezone:'Australia/Sydney'}).grove_history,history);});
import {createHubPrefsHandler} from '../../netlify/functions/hub-prefs.mjs';
const env={LIFE_HUB_PASSPHRASE_HASH:'test',SESSION_SECRET:'s'.repeat(32)};
const request=(method,body)=>new Request('https://life-hub.adam-russell.com/api/hub-prefs',{method,headers:{'sec-fetch-site':'same-origin','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const handlerFor=store=>createHubPrefsHandler({env,getContentStore:()=>store,verifySessionToken:()=>({valid:true})});
test('protected independent history import validates, replaces, reloads and preserves preferences',async()=>{
 const data=new Map([['meta/hub_prefs',{timezone:'Australia/Sydney',dismissed_insight_ids:[{id:'keep',fingerprint:'keep'}],school_terms:[],marking_default_minutes_per_script:17}]]);const writes=[];
 const store={async get(key,options){assert.equal(options.consistency,'strong');return structuredClone(data.get(key)??null);},async setJSON(key,value){writes.push(key);data.set(key,structuredClone(value));}};
 const handler=handlerFor(store);
 assert.equal((await handler(request('PATCH',{grove_history:{schema_version:2,years:[]}}))).status,400);assert.equal(writes.length,0);
 assert.equal((await handler(request('PATCH',{grove_history:history}))).status,200);assert.deepEqual(writes,['meta/grove_history']);assert.deepEqual(data.get('meta/grove_history'),history);assert.equal(data.get('meta/hub_prefs').marking_default_minutes_per_script,17);
 await handler(request('PATCH',{timezone:'UTC'}));await handler(request('PATCH',{grove_history:history}));
 assert.deepEqual((await (await handler(request('GET'))).json()).data.grove_history,history);
 assert.equal(data.get('meta/hub_prefs').grove_history,undefined);
 const unauth=createHubPrefsHandler({env,getContentStore:()=>store,verifySessionToken:()=>({valid:false})});assert.equal((await unauth(request('PATCH',{grove_history:history}))).status,401);
});
test('overlapping import and stale unrelated or agent whole-pref writes cannot erase history',async()=>{
 const data=new Map([['meta/hub_prefs',{timezone:'Australia/Sydney'}]]);let reads=0;let release;const barrier=new Promise(resolve=>release=resolve);
 const store={async get(key){const snapshot=structuredClone(data.get(key)??null);if(key==='meta/hub_prefs'&&reads<2){reads++;if(reads===2)release();await barrier;}return snapshot;},async setJSON(key,value){data.set(key,structuredClone(value));}};
 const handler=handlerFor(store);
 const [imported,unrelated]=await Promise.all([handler(request('PATCH',{grove_history:history})),handler(request('PATCH',{timezone:'UTC'}))]);assert.equal(imported.status,200);assert.equal(unrelated.status,200);
 assert.deepEqual((await (await handler(request('GET'))).json()).data.grove_history,history);assert.equal(data.get('meta/hub_prefs').timezone,'UTC');
 // An agent computed this snapshot before import and performs its ordinary whole-record write afterward.
 await store.setJSON('meta/hub_prefs',mergeHubPrefsPatch({timezone:'Australia/Sydney'},{marking_default_minutes_per_script:22}));
 assert.deepEqual((await (await handler(request('GET'))).json()).data.grove_history,history);
});
test('combined patch validates before all writes and reports failure without claiming both saved',async()=>{
 const data=new Map([['meta/hub_prefs',{timezone:'Australia/Sydney'}]]);const writes=[];
 const store={async get(key){return structuredClone(data.get(key)??null);},async setJSON(key,value){writes.push(key);if(key==='meta/grove_history')throw new Error('History storage unavailable');data.set(key,structuredClone(value));}};
 const handler=handlerFor(store);
 assert.equal((await handler(request('PATCH',{timezone:'UTC',grove_history:{schema_version:2,years:[]}}))).status,400);assert.deepEqual(writes,[]);
 const failed=await handler(request('PATCH',{timezone:'UTC',grove_history:history}));assert.equal(failed.status,400);assert.equal((await failed.json()).ok,false);assert.equal(data.get('meta/grove_history'),undefined);
});
