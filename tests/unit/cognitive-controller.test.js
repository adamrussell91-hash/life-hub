import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { catalog, createSession, advance, act, buildPrompt, BURST_WORDS } from '../../netlify/functions/_shared/cognitive-controller.mjs';

const intake = {task:'Design a community library event',focus:'Career direction',constraints:'No relocation',trajectory:'Two years in current role',claim:'Short meetings improve participation',context:'Proposal',audience:'Library committee',topic:'Meeting participation',purpose:'Evidence for a proposal',conflict:'Rest versus volunteering',behaviour:'I volunteered twice',aspirations:'Protect rest',timescale:'weekly',dilemma:'Disclose a scoring error',parties:'Applicant and committee',instance:'Choosing between two venues',timeBoundary:'Yesterday',outcome:'Selected venue A',problem:'Meetings repeatedly overrun despite three agenda changes and a facilitator rotation across two terms',entrenchment:'Three changes have failed and the same people keep reopening the same framing in every review cycle',framing:'We need tighter agendas and stronger chairing so the overrun stops',sources:'Paper A (2020) reports a small experiment. Paper B (2021) reports a contradictory survey.'};
function start(id, mode, extra={}) { return createSession({id:randomUUID(),owner:'owner',protocolId:id,mode,intake:{...intake,...extra},requestId:randomUUID()}); }
function model(calls,{askCycles=false}={}) {
  return async p => {
    calls.push(p);
    if(p.stage==='dialogue')return {text:'Duty and rights here require honesty. Which obligation can you accept?',question:'Which obligation can you accept?',done:true,evidenceIds:[],nextSpeaker:'consequence'};
    if(p.gate||p.stage==='filter'||p.stage==='clarify'||p.stage==='sigrid'||p.stage==='present'||p.stage==='close'||p.stage==='briefing'||p.stage==='plan'||String(p.stage).startsWith('interrogation')||String(p.stage).startsWith('reopen')||String(p.stage).startsWith('cycle')){
      const continuing=askCycles&&String(p.stage).startsWith('cycle')&&p.burst===1;
      return {text:'Grounded contribution for this stop.',question:'What concrete evidence changes this?',done:!continuing,evidenceIds:[],nextSpeaker:p.stage==='filter'?'atropos':undefined};
    }
    if(p.speaker==='ketill'||p.speaker==='alvar'){
      const ask=p.burst===1;
      return {text:'Horizon finding spoken in character.',question:ask?'Which constraint is load-bearing here?':null,done:!ask,evidenceIds:[]};
    }
    return {text:'Grounded contribution.',question:null,done:true,evidenceIds:[],nextSpeaker:'consequence'};
  };
}
async function run(id,mode,{askCycles=false,extraIntake={}}={}) {
  let s=start(id,mode,extraIntake); const calls=[];
  for(let n=0;n<490&&s.status!=='completed';n++){
    if(s.status==='queued') s=await advance(s,{model:model(calls,{askCycles}),retrieve:async()=>({evidence:[],status:'No matching notes; self-report only.'})});
    else if(s.status==='waiting'){
      let action=s.checkpoint.kind==='reflection'?'reflect':s.checkpoint.kind==='verify'?'confirm':s.allowedActions.includes('finish')?'finish':s.allowedActions.includes('close')?'close':s.allowedActions.includes('confirm')?'confirm':'answer';
      s=act(s,{action,text:'Concrete answer',revision:s.revision,requestId:randomUUID()});
    } else throw Error(s.status);
  }
  return {s,calls};
}
for(const id of ['fates','horizon','refinery','cartographers','mirror','consilium','witness','tribunal']) test(`${id} completes with independent calls and no model-owned transitions`,async()=>{const {s,calls}=await run(id,id==='fates'?'sprint':undefined);assert.equal(s.status,'completed');assert.ok(calls.length>=3); assert.equal(s.protocolId,id);});
test('every required intake field is machine-enforced',()=>{for(const d of catalog)for(const f of d.intake.filter(f=>f.required)){assert.throws(()=>createSession({id:randomUUID(),owner:'owner',protocolId:d.id,intake:{...intake,[f.id]:''},requestId:randomUUID()}),/required/);}});
test('Fates stop counts and breaks differ by mode without quotas',async()=>{
  for(const [mode,stops,breaks] of [['sprint',3,0],['normal',6,1],['long',12,2]]){
    const {calls}=await run('fates',mode);
    assert.equal(new Set(calls.filter(c=>c.stage.startsWith('cycle')).map(c=>c.stage)).size,stops);
    assert.equal(new Set(calls.filter(c=>c.stage.startsWith('interrogation')).map(c=>c.stage)).size,breaks);
    assert.equal(calls.some(c=>/Micro-turn/i.test(c.system)),false);
    assert.equal(calls.some(c=>'micro'in c||'quota'in c),false);
  }
});
test('burst continuation re-runs the same step until done or maxBursts',async()=>{
  let s=start('horizon'); const calls=[];
  s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
  assert.equal(s.status,'waiting'); assert.equal(s.speaker,'ketill'); assert.equal(s.continueBurst,true);
  s=act(s,{action:'answer',text:'Time is the constraint',revision:s.revision,requestId:randomUUID()});
  s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
  assert.ok(calls.filter(c=>c.speaker==='ketill').length>=2);
  assert.match(calls[1].system,/Continuation burst|Continue from that answer/i);
});
test('over-budget voice is re-asked then trimmed; length never fails the session',async()=>{
  const long='word '.repeat(400).trim();
  let attempts=0;
  let s=start('refinery','build');
  s=await advance(s,{retrieve:async()=>({evidence:[],status:'none'}),model:async()=>{attempts++;return {text:long,question:null,done:true,evidenceIds:[]};}});
  assert.equal(s.status,'completed');
  assert.ok(attempts>=3);
  assert.equal(s.transcript.some(t=>t.trimmed),true);
  assert.notEqual(s.status,'failed');
});
test('wrap jumps from an answer checkpoint to the filter',async()=>{
  let s=start('fates','sprint'); const calls=[];
  s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
  assert.ok(s.allowedActions.includes('wrap'));
  s=act(s,{action:'wrap',revision:s.revision,requestId:randomUUID()});
  assert.equal(s.steps[s.cursor].filter,true);
  s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
  assert.equal(s.stage,'filter');
});
test('reopen inserts a Fate stop then re-runs the filter, capped at two',async()=>{
  let s=start('fates','sprint'); const calls=[];
  const reply=()=>{
    const action=s.allowedActions.includes('reopen')?null:s.allowedActions.includes('confirm')?'confirm':s.allowedActions.includes('close')?'close':s.allowedActions.includes('answer')?'answer':null;
    if(!action)throw Error(`no reply action in ${s.status} ${s.stage} ${s.allowedActions}`);
    s=act(s,{action,text:'Concrete answer',revision:s.revision,requestId:randomUUID()});
  };
  for(let n=0;n<80&&!(s.status==='waiting'&&s.allowedActions.includes('reopen'));n++){
    if(s.status==='queued')s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
    else if(s.status==='waiting')reply();
    else break;
  }
  assert.ok(s.allowedActions.includes('reopen'));
  s=act(s,{action:'reopen',text:'Unsupported claim about audience',revision:s.revision,requestId:randomUUID()});
  assert.equal(s.steps[s.cursor].stage,'reopen-1');
  assert.equal(s.reopens,1);
  for(let n=0;n<40&&!(s.status==='waiting'&&s.allowedActions.includes('reopen'));n++){
    if(s.status==='queued')s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
    else if(s.status==='waiting')reply();
  }
  assert.ok(s.allowedActions.includes('reopen'));
  s=act(s,{action:'reopen',text:'Narrowed options',revision:s.revision,requestId:randomUUID()});
  assert.equal(s.reopens,2);
  for(let n=0;n<40&&!(s.status==='waiting'&&s.allowedActions.includes('close')&&!s.allowedActions.includes('reopen'));n++){
    if(s.status==='queued')s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
    else if(s.status==='waiting'){
      if(s.allowedActions.includes('reopen'))break;
      reply();
    }
  }
  assert.equal(s.allowedActions.includes('reopen'),false);
  assert.ok(s.allowedActions.includes('confirm'));
  assert.ok(s.allowedActions.includes('close'));
});
test('Tribunal clarify enriches input identically for all three voices',async()=>{
  const thin={problem:'Meetings overrun',entrenchment:'Stuck',framing:'Need agendas'};
  let s=start('tribunal',undefined,thin); const calls=[];
  s=await advance(s,{model:async p=>{calls.push(p);return {text:'Need one fact.',question:'Who owns the agenda?',done:false,evidenceIds:[]};},retrieve:async()=>({evidence:[],status:'none'})});
  assert.equal(s.stage,'clarify');
  s=act(s,{action:'answer',text:'The chair owns it',revision:s.revision,requestId:randomUUID()});
  s=await advance(s,{model:async p=>{calls.push(p);return {text:'Enough.',question:null,done:true,evidenceIds:[]};},retrieve:async()=>({evidence:[],status:'none'})});
  // run voices
  while(s.status==='queued'||s.status==='running'){
    s=await advance(s,{model:async p=>{calls.push(p);return {text:'Grounded contribution.',question:null,done:true,evidenceIds:[]};},retrieve:async()=>({evidence:[],status:'none'})});
    if(s.status==='waiting')s=act(s,{action:'answer',text:'ok',revision:s.revision,requestId:randomUUID()});
    if(s.status==='completed')break;
  }
  const v=calls.filter(c=>['inverter','scaler','context-shifter'].includes(c.speaker));
  assert.equal(v.length,3);
  assert.equal(v[0].user,v[1].user);
  assert.equal(v[1].user,v[2].user);
  assert.match(v[0].user,/The chair owns it/);
});
test('Horizon Ketill may ask; generic guard exposes max bursts',()=>{
  const h=start('horizon');
  const ketill=buildPrompt(h,{speaker:'ketill',stage:'ketill',maxBursts:3,burstWords:90});
  assert.match(ketill.system,/steering question per burst/i);
  assert.match(ketill.system,/Burst 1 of 3/);
  assert.doesNotMatch(ketill.system,/No plan, no question/);
});
test('checkpoint blocks advance until answered; Witness corrections are reverified',async()=>{let s=start('witness');const calls=[];s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});assert.equal(s.checkpoint.kind,'verify');assert.equal(calls.length,1);assert.deepEqual(await advance(s,{model:model(calls)}),s);s=act(s,{action:'correct',text:'I compared both venues first',revision:s.revision,requestId:randomUUID()});s=await advance(s,{model:model(calls)});assert.equal(s.checkpoint.kind,'verify');assert.equal(calls.length,2);assert.equal(calls[1].stage,'trace');assert.throws(()=>act(s,{action:'finish',revision:s.revision,requestId:randomUUID()}));s=act(s,{action:'uncertain',revision:s.revision,requestId:randomUUID()});s=await advance(s,{model:model(calls)});assert.equal(s.status,'completed');assert.match(calls.find(c=>c.stage==='patterns').system,/sound thinking|Sound thinking/);assert.match(calls.find(c=>c.stage==='patterns').user,/uncertain/);});
test('checkpoint voices keep their analysis and extract a final question',async()=>{let s=start('fates','sprint');s=await advance(s,{model:async()=>({text:'The decision has two live tensions. Which constraint should govern the first pass?',evidenceIds:[]}),retrieve:async()=>({evidence:[],status:'none'})});assert.equal(s.status,'waiting');assert.equal(s.checkpoint.question,'Which constraint should govern the first pass?');assert.match(s.transcript.at(-1).text,/two live tensions/);});
test('JSON voice output supplies the checkpoint question instead of failing the gate',async()=>{
  const retrieve=async()=>({evidence:[],status:'none'});
  const payload={text:'The decision has two live tensions around audience and time.',question:'Which constraint should govern the first pass?',evidenceIds:[]};
  for(const text of [JSON.stringify(payload),`\`\`\`json\n${JSON.stringify(payload,null,2)}\n\`\`\``]){
    let s=start('fates','sprint');
    s=await advance(s,{model:async()=>({text,evidenceIds:[]}),retrieve});
    assert.equal(s.status,'waiting');
    assert.equal(s.checkpoint.question,'Which constraint should govern the first pass?');
    assert.match(s.transcript.at(-1).text,/two live tensions/);
    assert.equal(s.transcript.at(-1).text.includes('{"text"'),false);
  }
  let s=start('fates','sprint');
  await assert.rejects(()=>advance(s,{model:async()=>({text:JSON.stringify({text:'Only analysis.',question:null,evidenceIds:[]}),evidenceIds:[]}),retrieve}),/omitted its required checkpoint question/);
  s=start('fates','sprint');
  s=await advance(s,{model:async()=>({text:'{"text":"Audience is still open.\\nTime is not.","question":"Which constraint should govern the first pass?","evidenceIds":[]}'.replace('\\n','\n'),evidenceIds:[]}),retrieve});
  assert.equal(s.status,'waiting');
  assert.equal(s.checkpoint.question,'Which constraint should govern the first pass?');
  assert.match(s.transcript.at(-1).text,/Audience is still open/);
  s=start('fates','sprint');
  s=await advance(s,{model:async()=>({text:JSON.stringify({question:'Which constraint should govern the first pass?',evidenceIds:[]}),evidenceIds:[]}),retrieve});
  assert.equal(s.status,'waiting');
  assert.equal(s.checkpoint.question,'Which constraint should govern the first pass?');
});
test('Tribunal voices receive identical original context and cannot see outputs',async()=>{const {calls}=await run('tribunal');const v=calls.filter(c=>['inverter','scaler','context-shifter'].includes(c.speaker));assert.equal(v.length,3);assert.equal(v[0].user,v[1].user);assert.equal(v[1].user,v[2].user);assert.ok(!v[2].user.includes('Grounded contribution'));});
test('Consilium adapts to next-speaker proposal, never Virtue first, and never analyses final reflection',async()=>{let s=start('consilium');const calls=[];const generate=async p=>{calls.push(p);return {text:'Duty and rights here require candour. Which constraint matters?',question:'Which constraint matters?',evidenceIds:[],nextSpeaker:'virtue'};};s=await advance(s,{model:generate,retrieve:async()=>({evidence:[],status:'none'})});assert.equal(calls.length,1);s=act(s,{action:'confirm',revision:s.revision,requestId:randomUUID()});s=await advance(s,{model:generate});assert.notEqual(calls.at(-1).speaker,'virtue');s=act(s,{action:'answer',text:'Protect anonymity',revision:s.revision,requestId:randomUUID()});s=await advance(s,{model:generate});assert.equal(calls.at(-1).speaker,'virtue');assert.ok(!s.allowedActions.includes('finish'));const {s:done,calls:all}=await run('consilium');assert.equal(done.transcript.at(-1).role,'user');assert.equal(all.at(-1).stage,'map');});
test('direct sources skip search and Surveyor; partial Refinery skips excluded voices',async()=>{let s=start('cartographers','direct');const calls=[];s=await advance(s,{model:model(calls),retrieve:()=>{throw Error('search must not run');}});assert.equal(s.status,'completed');assert.deepEqual(calls.map(c=>c.speaker),['miner','cartographer']);for(const [mode,expected] of [['break',['breaker']],['build-break',['builder','breaker']]]){const {calls}=await run('refinery',mode);assert.deepEqual(calls.map(c=>c.speaker),expected);}});
test('Mirror deep waits for framing, long arc asks what to protect; Horizon fallback explicit',async()=>{const {calls}=await run('mirror','deep');assert.equal(calls[0].stage,'framing');const s=start('mirror');s.intake.timescale='long-arc';assert.match(buildPrompt(s,{speaker:'present',stage:'present'}).system,/sit with, tolerate|protect/);const h=start('horizon');assert.match(buildPrompt(h,{speaker:'alvar',stage:'alvar'}).system,/extrapolated from current trajectory/);});
test('Horizon speakers receive their own Norse lives, and other protocols do not',()=>{
  const h=start('horizon');
  const ketill=buildPrompt(h,{speaker:'ketill',stage:'ketill'}).system;
  const alvar=buildPrompt(h,{speaker:'alvar',stage:'alvar'}).system;
  const sigrid=buildPrompt(h,{speaker:'sigrid',stage:'sigrid',gate:'answer'}).system;
  const map=buildPrompt(h,{speaker:'controller',stage:'map'}).system;
  const fates=buildPrompt(start('fates','sprint'),{speaker:'lachesis',stage:'briefing',gate:'answer'}).system;
  for(const system of [ketill,alvar,sigrid,map]) assert.match(system,/not analysts dressed as Norse/);
  assert.match(ketill,/Miðgarðr/);
  assert.match(ketill,/jǫrð/);
  assert.match(ketill,/You are Ketill only/);
  assert.match(ketill,/six months to two years/);
  assert.doesNotMatch(ketill,/You are Alvar only/);
  assert.match(alvar,/Yggdrasill/);
  assert.match(alvar,/örlög/);
  assert.match(alvar,/You are Alvar only/);
  assert.match(alvar,/extrapolated from current trajectory/);
  assert.doesNotMatch(alvar,/You are Sigrid only/);
  assert.match(sigrid,/iron ring/);
  assert.match(sigrid,/unexamined drift/);
  assert.match(sigrid,/You are Sigrid only/);
  assert.match(sigrid,/Ask that and stop/);
  assert.match(map,/map compiler, not a fourth/);
  assert.equal(fates.includes('Hearthkeeper'),false);
  assert.equal(fates.includes('Miðgarðr'),false);
  const stated=start('horizon');
  stated.intake.desiredFuture='A small workshop and a quiet winter';
  const aimed=buildPrompt(stated,{speaker:'alvar',stage:'alvar'}).system;
  assert.match(aimed,/You are Alvar only/);
  assert.match(aimed,/Do not use the extrapolation fallback/);
  assert.equal(aimed.includes('Fallback required'),false);
});
test('voices are told to use relevant notes organically and never narrate an empty archive',()=>{
  const s=start('fates','sprint');
  s.evidence=[{id:'knowledge:note-1',kind:'knowledge_hub_note',title:'Workload and rest',text:'You wrote that afternoon marking leaves no recovery.'}];
  s.evidenceStatus='No matching Knowledge Hub notes were retrieved. Claims remain self-report or uncertainty.';
  const grounded=buildPrompt(s,{speaker:'lachesis',stage:'briefing',gate:'answer'});
  assert.match(grounded.system,/already know/);
  assert.match(grounded.system,/Never mention Knowledge Hub notes/);
  assert.match(grounded.user,/Workload and rest/);
  assert.equal(grounded.user.includes('No matching Knowledge Hub notes'),false);
  assert.equal(grounded.user.includes('evidenceStatus'),false);
  const empty=buildPrompt(start('fates','sprint'),{speaker:'lachesis',stage:'briefing',gate:'answer'});
  assert.equal(empty.user.includes('knownContext'),false);
  assert.equal(empty.user.includes('self-report'),false);
});
test('unverified quotes are rejected, and terminal state cannot be model-commanded',async()=>{let s=start('tribunal');await assert.rejects(()=>advance(s,{retrieve:async()=>({evidence:[],status:'none'}),model:async()=>({text:'Claim',quotes:[{evidenceId:'fake',text:'made up'}],evidenceIds:['fake']})}),/evidence|quotation/);});
test('cooperative Fates Normal asks across about sixteen user replies',async()=>{
  const {s,calls}=await run('fates','normal',{askCycles:true});
  assert.equal(s.status,'completed');
  const replies=s.transcript.filter(t=>t.role==='user').length;
  // Final ungated burst closes without asking, so each cycle stop yields one reply not two.
  assert.ok(replies>=10&&replies<=22,`expected ~12 replies, got ${replies}`);
  assert.ok(calls.filter(c=>c.stage.startsWith('cycle')).length>=6);
});
test('Consilium mid-burst answers hit maxBursts without growing the step list',async()=>{
  let s=start('consilium');
  const calls=[];
  const sticky=async p=>{
    calls.push(p);
    if(p.stage==='framing')return {text:'Frame the dilemma.',question:'Is the core duty clear?',done:true,evidenceIds:[]};
    if(p.stage==='map')return {text:'Conflict map.',question:'What remains unsettled?',done:true,evidenceIds:[]};
    return {text:`${p.speaker} keeps pressing.`,question:'Which duty wins?',done:false,evidenceIds:[],nextSpeaker:'consequence'};
  };
  const retrieve=async()=>({evidence:[],status:'none'});
  s=await advance(s,{model:sticky,retrieve});
  s=act(s,{action:'confirm',revision:s.revision,requestId:randomUUID()});
  const stepsBefore=s.steps.length;
  s=await advance(s,{model:sticky,retrieve});
  assert.equal(s.status,'waiting');
  assert.equal(s.continueBurst,true);
  assert.equal(s.speaker,'principle');
  for(let i=0;i<5&&s.status==='waiting'&&s.speaker==='principle';i++){
    s=act(s,{action:'answer',text:`Answer ${i}`,revision:s.revision,requestId:randomUUID()});
    s=await advance(s,{model:sticky,retrieve});
  }
  const principleCalls=calls.filter(c=>c.speaker==='principle'&&c.stage==='dialogue');
  assert.equal(principleCalls.length,3);
  assert.match(principleCalls.at(-1).system,/final burst|Close without asking/i);
  assert.notEqual(s.speaker,'principle');
  assert.ok(s.steps.length<=stepsBefore+2,`step list grew unboundedly: ${s.steps.length}`);
  const principleAnswers=s.transcript.filter(t=>t.role==='user'&&t.stage==='dialogue').length;
  assert.ok(principleAnswers>=2);
});
test('wrap is Fates-only before the filter and absent at close',async()=>{
  for(const id of ['horizon','refinery','cartographers','mirror','consilium','witness','tribunal']){
    let s=start(id,id==='refinery'?'build':undefined);
    const calls=[];
    s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
    if(s.status==='waiting')assert.equal(s.allowedActions.includes('wrap'),false,`${id} must not offer wrap`);
  }
  let s=start('fates','sprint'); const calls=[];
  s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
  assert.ok(s.allowedActions.includes('wrap'));
  s=act(s,{action:'wrap',revision:s.revision,requestId:randomUUID()});
  assert.equal(s.steps[s.cursor].filter,true);
  assert.equal(s.continueBurst,false);
  assert.equal(s.burst,0);
  for(let n=0;n<40&&!(s.status==='waiting'&&s.stage==='close');n++){
    if(s.status==='queued')s=await advance(s,{model:model(calls),retrieve:async()=>({evidence:[],status:'none'})});
    else if(s.status==='waiting'){
      const action=s.allowedActions.includes('close')?'close':s.allowedActions.includes('confirm')?'confirm':'answer';
      s=act(s,{action,text:'ok',revision:s.revision,requestId:randomUUID()});
    } else break;
  }
  assert.equal(s.stage,'close');
  assert.equal(s.allowedActions.includes('wrap'),false);
});
test('per-protocol burstWords table reaches the built prompt budget',()=>{
  const samples=[
    ['fates','sprint','lachesis','briefing',BURST_WORDS.fates],
    ['horizon',undefined,'ketill','ketill',BURST_WORDS.horizon.ketill],
    ['refinery','build','builder','builder',BURST_WORDS.refinery],
    ['cartographers','focused','surveyor','surveyor',BURST_WORDS.cartographers],
    ['mirror',undefined,'retrospective','retrospective',BURST_WORDS.mirror],
    ['consilium',undefined,'principle','dialogue',BURST_WORDS.consilium],
    ['witness',undefined,'patterns','patterns',BURST_WORDS.witness.patterns],
    ['tribunal','standard','inverter','inverter',BURST_WORDS.tribunal],
  ];
  for(const [id,mode,speaker,stage,expected] of samples){
    const s=start(id,mode);
    const st=s.steps.find(x=>x.speaker===speaker&&x.stage===stage)||s.steps.find(x=>x.stage===stage)||s.steps.find(x=>x.speaker===speaker);
    assert.ok(st,`${id} missing step ${speaker}/${stage}`);
    assert.equal(st.burstWords,expected,`${id} step burstWords`);
    const p=buildPrompt(s,st);
    assert.equal(p.wordBudget,expected,`${id} prompt budget`);
  }
});
test('Fates stopBudget caps the first burst at burstWords and never exceeds remaining stop words',()=>{
  const s=start('fates','sprint');
  const st=s.steps.find(x=>x.stopWords);
  assert.equal(st.burstWords,125);
  assert.equal(st.stopWords,250);
  const first=buildPrompt(s,st);
  assert.equal(first.wordBudget,125);
  s.transcript.push({id:randomUUID(),role:'voice',speaker:st.speaker,stage:st.stage,text:Array(100).fill('word').join(' '),createdAt:new Date().toISOString(),evidenceIds:[]});
  s.burst=1;
  const second=buildPrompt(s,st);
  assert.ok(second.wordBudget<=125);
  assert.ok(second.wordBudget<=150);
  assert.equal(second.wordBudget,Math.min(125,250-100));
});

test('continuation bursts explicitly preserve the assigned voice register',()=>{
  const s=start('refinery','build');
  const st=s.steps[0];
  s.burst=1;
  const prompt=buildPrompt(s,st);
  assert.match(prompt.system,/Keep the same assigned voice register as the first burst\./);
});
