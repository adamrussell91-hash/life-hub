import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHubPrefsRecord,mergeHubPrefsPatch} from '../../netlify/functions/_shared/hub-prefs-agent.mjs';
const history={schema_version:1,years:[]};
test('ordinary preference and agent patches preserve private Grove history',()=>{assert.deepEqual(parseHubPrefsRecord({grove_history:history}).grove_history,history);assert.deepEqual(mergeHubPrefsPatch({grove_history:history},{timezone:'Australia/Sydney'}).grove_history,history);});
import {createHubPrefsHandler} from '../../netlify/functions/hub-prefs.mjs';
test('protected import validates atomically, replaces, reloads and preserves unrelated preferences',async()=>{
 let stored={timezone:'Australia/Sydney',dismissed_insight_ids:[{id:'keep',fingerprint:'keep'}],school_terms:[],marking_default_minutes_per_script:17};let writes=0;
 const store={async get(key,options){assert.equal(options.consistency,'strong');return structuredClone(stored);},async setJSON(key,value){writes++;stored=structuredClone(value);}};
 const env={LIFE_HUB_PASSPHRASE_HASH:'test',SESSION_SECRET:'s'.repeat(32)};
 const handler=createHubPrefsHandler({env,getContentStore:()=>store,verifySessionToken:()=>({valid:true})});
 const request=(method,body)=>new Request('https://life-hub.adam-russell.com/api/hub-prefs',{method,headers:{'sec-fetch-site':'same-origin','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const bad=await handler(request('PATCH',{grove_history:{schema_version:2,years:[]}}));assert.equal(bad.status,400);assert.equal(writes,0);
 const good=await handler(request('PATCH',{grove_history:history}));assert.equal(good.status,200);assert.deepEqual(stored.grove_history,history);assert.equal(stored.marking_default_minutes_per_script,17);assert.equal(stored.dismissed_insight_ids[0].id,'keep');
 await handler(request('PATCH',{timezone:'UTC'}));assert.deepEqual(stored.grove_history,history);
 await handler(request('PATCH',{grove_history:history}));assert.deepEqual(stored.grove_history,history);
 const loaded=(await (await handler(request('GET'))).json()).data;assert.deepEqual(loaded.grove_history,history);
 const unauth=createHubPrefsHandler({env,getContentStore:()=>store,verifySessionToken:()=>({valid:false})});assert.equal((await unauth(request('PATCH',{grove_history:history}))).status,401);
});
