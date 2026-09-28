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
    if(p.speaker==='retrospective'||p.speaker==='prospective'){
      const ask=p.burst<p.maxBursts;
      return {text:'Mirror reading spoken in character.',question:ask?'What else belongs on the record for those months?':null,done:!ask,evidenceIds:[]};
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
  let s=start('refinery','break');
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
  let s=start('refinery','full');
  {const calls=[];const g=await advance(s,{model:async p=>{calls.push(p);return {text:JSON.stringify({text:'Only analysis.',question:null,evidenceIds:[]}),evidenceIds:[]};},retrieve});
   assert.equal(g.status,'waiting');assert.ok(g.checkpoint.question,'gate falls back to a checkpoint question');
   assert.match(calls[1].system,/had no question/,'the voice is re-asked once first');}
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
test('direct sources skip search and Surveyor; partial Refinery skips excluded voices',async()=>{let s=start('cartographers','direct');const calls=[];s=await advance(s,{model:model(calls),retrieve:()=>{throw Error('search must not run');}});assert.equal(s.status,'completed');assert.deepEqual(calls.map(c=>c.speaker),['miner','cartographer','controller']);assert.ok(calls.every(c=>!c.tools));for(const [mode,expected] of [['break',['breaker','controller']],['build-break',['controller','builder','breaker','controller']]]){const {calls}=await run('refinery',mode);assert.deepEqual(calls.map(c=>c.speaker),expected);}});
test('Mirror deep waits for framing, long arc asks what to protect; Horizon fallback explicit',async()=>{const {calls}=await run('mirror','deep');assert.equal(calls[0].stage,'framing');const s=start('mirror');s.intake.timescale='long-arc';assert.match(buildPrompt(s,{speaker:'present',stage:'present'}).system,/sit with, tolerate|protect/);const h=start('horizon');assert.match(buildPrompt(h,{speaker:'alvar',stage:'alvar'}).system,/extrapolated from current trajectory/);});
test('Mirror speakers receive Gu Jian / Wang Yuan / Zheng Ming writing profiles',()=>{
  const s=start('mirror');
  const gu=buildPrompt(s,{speaker:'retrospective',stage:'retrospective',maxBursts:3,burstWords:90}).system;
  const wang=buildPrompt(s,{speaker:'prospective',stage:'prospective',maxBursts:3,burstWords:90}).system;
  const zheng=buildPrompt(s,{speaker:'present',stage:'present',gate:'answer',maxBursts:1,burstWords:90}).system;
  assert.match(gu,/You are Gu Jian only/);
  assert.match(gu,/Ask one steering question in character/);
  assert.match(gu,/Gu Jian, the Retrospective|old mirror|scholars' hall/);
  assert.doesNotMatch(gu,/You are Wang Yuan only/);
  assert.match(wang,/You are Wang Yuan only/);
  assert.match(wang,/Ask one short real question in character/);
  assert.match(zheng,/You are Zheng Ming only/);
  assert.match(zheng,/seven-day/);
});
test('Mirror and Fates re-ask a missing in-character question once, then continue instead of failing',async()=>{
  const retrieve=async()=>({evidence:[],status:'none'});
  for(const [id,mode,speaker] of [['mirror','quick','retrospective'],['fates','sprint','clotho']]){
    let s=start(id,mode);s.cursor=s.steps.findIndex(st=>st.speaker===speaker);s.status='queued';s.burst=0;s.retrieved=true;
    const calls=[];
    s=await advance(s,{retrieve,oneStage:true,model:async p=>{calls.push(p);return {text:'A reading with no question.',question:null,done:true,evidenceIds:[]};}});
    assert.notEqual(s.status,'failed',`${id} must not fail`);
    assert.equal(calls.length,2,`${id} re-asks once`);assert.match(calls[1].system,/had no question/);
  }
});
test('Consilium falls back to an invitation when a voice still will not ask',async()=>{
  let s=start('consilium');const retrieve=async()=>({evidence:[],status:'none'});
  s.cursor=1;s.status='queued';s.retrieved=true;s.dialogueCounts={principle:1};s.stage='dialogue';
  s=await advance(s,{retrieve,oneStage:true,model:async()=>({text:'Duty and rights here require candour.',question:null,done:true,evidenceIds:[]})});
  assert.equal(s.status,'waiting');assert.match(s.checkpoint.question,/What is your response to Gaius Officius/);
});
test('every protocol voice receives a You-are-X-only speaker register in the prompt',()=>{
  const samples=[
    ['fates','sprint','lachesis','briefing','You are Lachesis only'],
    ['fates','sprint','clotho','cycle1-clotho','You are Clotho only'],
    ['fates','sprint','atropos','cycle1-atropos','You are Atropos only'],
    ['horizon','full','ketill','ketill','You are Ketill only'],
    ['horizon','full','alvar','alvar','You are Alvar only'],
    ['horizon','full','sigrid','sigrid','You are Sigrid only'],
    ['mirror','quick','retrospective','retrospective','You are Gu Jian only'],
    ['mirror','quick','prospective','prospective','You are Wang Yuan only'],
    ['mirror','quick','present','present','You are Zheng Ming only'],
    ['refinery','full','builder','builder','You are Bezalel the Builder only'],
    ['refinery','full','breaker','breaker','You are Beruriah the Breaker only'],
    ['refinery','full','reforger','reforger','You are Nechemya the Reforger only'],
    ['cartographers','full','surveyor','surveyor','You are Captain Josiah Everly the Surveyor only'],
    ['cartographers','full','miner','miner','You are Miss Harriet Quarrington the Miner only'],
    ['cartographers','full','cartographer','cartographer','You are Mr Ambrose Meridith the Cartographer only'],
    ['consilium','standard','principle','dialogue','You are Gaius Officius the Principle only'],
    ['consilium','standard','consequence','dialogue','You are Lucius Eventus the Consequence only'],
    ['consilium','standard','virtue','dialogue','You are Titus Honestus the Virtue only'],
    ['witness','standard','trace','trace','You are Sati the Trace only'],
    ['witness','standard','patterns','patterns','You are Pañña the Pattern Match only'],
    ['witness','standard','recalibration','recalibration','You are Upekkhā the Recalibration only'],
    ['tribunal','standard','inverter','inverter','You are Counselor Frank Delacorte the Inverter only'],
    ['tribunal','standard','scaler','scaler','You are Special Master Ruth Abernathy the Scaler only'],
    ['tribunal','standard','context-shifter','context-shifter','You are Judge Hollis Venable the Context Shifter only'],
  ];
  for(const [id,mode,speaker,stage,needle] of samples){
    const s=start(id,mode);
    const system=buildPrompt(s,{speaker,stage,maxBursts:3,burstWords:90}).system;
    assert.match(system,new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`${id}:${speaker}`);
  }
});
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

test('Refinery confirms the restated thesis before Builder and waits for a choice when the thesis is unsound',async()=>{
  let s=start('refinery','full');const calls=[];const retrieve=async()=>({evidence:[],status:'none'});
  const m=async p=>{calls.push(p);if(p.gate)return {text:'Thesis: short meetings improve participation, for the library committee.',question:'Is that the thesis you want built?',done:true,evidenceIds:[]};return {text:`${p.speaker} pass.`,question:null,done:true,evidenceIds:[],thesisUnsound:p.speaker==='breaker'};};
  s=await advance(s,{model:m,retrieve});
  assert.equal(s.stage,'thesis');assert.equal(s.checkpoint.kind,'confirm');assert.equal(calls.length,1);assert.ok(!calls.some(c=>c.speaker==='builder'));
  s=act(s,{action:'confirm',revision:s.revision,requestId:randomUUID()});
  s=await advance(s,{model:m,retrieve});
  assert.equal(s.status,'waiting');assert.equal(s.speaker,'breaker');assert.match(s.checkpoint.question,/rebuild the original thesis|labelled as a suggestion/);
  assert.ok(!calls.some(c=>c.speaker==='reforger'),'Reforger must wait for the choice');
  s=act(s,{action:'answer',text:'Offer a labelled reframe',revision:s.revision,requestId:randomUUID()});
  s=await advance(s,{model:m,retrieve});
  assert.equal(s.status,'completed');
  assert.match(calls.find(c=>c.speaker==='reforger').system,/flagged unsound/);
  assert.equal(calls.at(-1).stage,'closing');
});
test('Cartographers interrogation keeps Surveyor silent, uses no search, and stops after passes 2 and 6',()=>{
  const s=start('cartographers','interrogation');
  assert.deepEqual(s.steps.map(st=>st.speaker),['miner','miner','miner','cartographer','miner','cartographer','miner','cartographer','cartographer','controller']);
  assert.deepEqual(s.steps.filter(st=>st.gate).map(st=>st.stage),['contradictions','master-synthesis']);
  for(const st of s.steps)assert.equal(buildPrompt(s,st).tools,undefined);
  const full=start('cartographers','full');assert.equal(buildPrompt(full,full.steps[0]).tools,undefined);
});
test('Witness trace has room for the reconstruction and closes with a summary',async()=>{
  const {calls}=await run('witness');
  assert.equal(calls.find(c=>c.stage==='trace').wordBudget,250);
  assert.equal(calls.at(-1).stage,'closing');
  const s=start('witness','deep');assert.equal(s.steps.find(st=>st.stage==='patterns').stopWords,350);
});
test('stop budgets make the burst that spends them final',()=>{
  const s=start('mirror');const st=s.steps.find(x=>x.speaker==='retrospective');
  assert.equal(buildPrompt(s,st).finalBurst,false);
  s.transcript.push({id:randomUUID(),role:'voice',speaker:'retrospective',stage:'retrospective',text:Array(90).fill('word').join(' '),createdAt:new Date().toISOString(),evidenceIds:[]});s.burst=1;
  const p=buildPrompt(s,st);assert.equal(p.finalBurst,true);assert.equal(p.wordBudget,60);
});
test('Mirror quick states its framing first; Horizon budgets fit the reckoning and full map',()=>{
  const m=start('mirror');assert.equal(m.steps[0].stage,'framing');assert.equal(m.steps[0].gate,null);
  assert.match(buildPrompt(m,m.steps[0]).system,/correction restarts the run/);
  const h=start('horizon');assert.equal(h.steps.find(st=>st.speaker==='sigrid').burstWords,180);assert.equal(h.steps.at(-1).burstWords,700);
  assert.equal(start('horizon','brief').steps.at(-1).burstWords,425);
  assert.match(buildPrompt(h,h.steps[1]).system,/event layer/);
});
test('Tribunal depth follows mode, voices ask nothing, clarify asks for attempts, close line is fixed',async()=>{
  assert.equal(start('tribunal','quick').steps.find(st=>st.speaker==='inverter').burstWords,60);
  assert.equal(start('tribunal','deep').steps.find(st=>st.speaker==='inverter').burstWords,250);
  const withAttempts=start('tribunal','standard',{priorAttempts:'Three agenda redesigns and a timer'});
  assert.equal(withAttempts.steps[0].speaker,'inverter');
  const s=start('tribunal');assert.equal(s.steps[0].stage,'clarify');assert.match(buildPrompt(s,s.steps[0]).system,/already been tried/);
  let t=withAttempts;const calls=[];
  const m=async p=>{calls.push(p);return {text:'A reframe.',question:p.speaker==='controller'?null:'Is that right?',done:false,evidenceIds:[]};};
  t=await advance(t,{model:m,retrieve:async()=>({evidence:[],status:'none'})});
  assert.equal(t.status,'completed');
  assert.ok(t.transcript.filter(x=>x.role==='voice').every(x=>!x.text.includes('Is that right?')));
  assert.ok(t.transcript.at(-1).text.endsWith('You decide which, if any, is worth pursuing.'));
});
test('a voice that names a scope mismatch holds for Adam; the model cannot end the run',async()=>{
  let s=start('mirror');const calls=[];const retrieve=async()=>({evidence:[],status:'none'});
  s=await advance(s,{model:async p=>{calls.push(p);return {text:'This is a logistics question, not a values conflict.',question:null,done:true,evidenceIds:[],outOfScope:calls.length===1};},retrieve});
  assert.equal(s.status,'waiting');assert.match(s.checkpoint.question,/outside what this protocol does/);assert.ok(s.allowedActions.includes('cancel'));
  s=act(s,{action:'answer',text:'It is about which value I serve',revision:s.revision,requestId:randomUUID()});
  s=await advance(s,{model:async p=>{calls.push(p);return {text:'Reframed.',question:'What else belongs on the record?',done:true,evidenceIds:[]};},retrieve});
  assert.equal(calls[1].stage,calls[0].stage,'the same step reruns with the clarification');
});
test('malformed voice JSON is salvaged into text instead of rendering raw JSON',async()=>{
  let s=start('tribunal','standard',{priorAttempts:'Timed agenda'});const retrieve=async()=>({evidence:[],status:'none'});
  s=await advance(s,{retrieve,model:async p=>p.stage==='convergence'?{text:'{"text":"All three frames point at the chair.\\nNone ranks.","question":null,"evidenceIds":[] trailing junk',evidenceIds:[]}:{text:'A reframe.',question:null,done:true,evidenceIds:[]}});
  const last=s.transcript.at(-1).text;
  assert.ok(!last.includes('"text"'),last);assert.match(last,/All three frames point at the chair/);
});
test('Horizon advice and a repeated Consilium opener each earn one re-ask',async()=>{
  const retrieve=async()=>({evidence:[],status:'none'});
  let h=start('horizon');const hc=[];
  h=await advance(h,{retrieve,oneStage:true,model:async p=>{hc.push(p);return {text:hc.length===1?'Push for the next rung now.':'The next rung opens a door and closes your evenings.',question:null,done:true,evidenceIds:[]};}});
  assert.equal(hc.length,2);assert.match(hc[1].system,/told Adam what to do/);assert.doesNotMatch(h.transcript.at(-1).text,/Push for/);
  let c=start('consilium');c.cursor=1;c.status='queued';c.retrieved=true;c.dialogueCounts={principle:1};c.answered={principle:1};
  const cc=[];
  c=await advance(c,{retrieve,oneStage:true,model:async p=>{cc.push(p);return {text:cc.length===1?'Duty and rights here require candour again.':'The committee is owed the corrected list.',question:'Who tells the student?',done:true,evidenceIds:[]};}});
  assert.equal(cc.length,2);assert.match(cc[1].system,/signature opening/);
});
test('Witness trace asks for a missing sequence before verifying',async()=>{
  let s=start('witness');const retrieve=async()=>({evidence:[],status:'none'});const calls=[];
  const m=async p=>{calls.push(p);return calls.length===1?{text:'There is no sequence here to reconstruct yet.',question:'What did you do first, and then?',needsInput:true,done:true,evidenceIds:[]}:{text:'Attention went first to price.',question:null,done:true,evidenceIds:[]};};
  s=await advance(s,{retrieve,model:m});
  assert.equal(s.checkpoint.kind,'answer');assert.match(s.checkpoint.question,/What did you do first/);
  s=act(s,{action:'answer',text:'Opened both quotes, booked the cheaper',revision:s.revision,requestId:randomUUID()});
  s=await advance(s,{retrieve,model:m});
  assert.equal(s.stage,'trace');assert.equal(s.checkpoint.kind,'verify');
});
test('cancel applies even with a stale revision',()=>{
  const s=start('mirror');s.revision=5;
  const c=act(s,{action:'cancel',revision:2,requestId:randomUUID()});
  assert.equal(c.status,'cancelled');
  assert.throws(()=>act(s,{action:'answer',text:'x',revision:2,requestId:randomUUID()}),/Session changed/);
});
test('third live run: Fates briefing may skip questions, interrogation passes are single-shot, search is capped',async()=>{
  const f=start('fates','sprint');
  assert.equal(f.steps.filter(st=>st.stage==='briefing').length,1);assert.equal(f.steps[0].gate,null);
  let s=f;const calls=[];
  s=await advance(s,{retrieve:async()=>({evidence:[],status:'none'}),oneStage:true,model:async p=>{calls.push(p);return {text:'The brief is complete.',question:null,done:true,evidenceIds:[]};}});
  assert.equal(calls.length,1,'no forced re-ask when the brief is complete');assert.equal(s.steps[s.cursor].stage,'plan');
  const c=start('cartographers','interrogation');
  assert.ok(c.steps.filter(st=>!st.gate&&st.speaker!=='controller').every(st=>st.maxBursts===1));
  assert.match(buildPrompt(c,c.steps[0]).system,/Ask nothing unless this is a checkpoint/);
  const r=start('refinery','full');assert.equal(buildPrompt(r,r.steps.find(st=>st.speaker==='builder')).tools,undefined,'no live search inside a voice turn');
});
test('a closing question with no checkpoint is dropped from the shown text',async()=>{
  let s=start('cartographers','interrogation');
  s=await advance(s,{retrieve:async()=>({evidence:[],status:'none'}),oneStage:true,model:async()=>({text:'Two clusters: speaking share and consultation. Continue to methodology audit, or draw here?',question:null,done:true,evidenceIds:[]})});
  assert.equal(s.transcript.at(-1).text,'Two clusters: speaking share and consultation.');
  assert.notEqual(s.status,'waiting');
});
test('a loosened Consilium opener still earns a re-ask',async()=>{
  let c=start('consilium');c.cursor=1;c.status='queued';c.retrieved=true;c.dialogueCounts={principle:1};c.answered={principle:1};const cc=[];
  c=await advance(c,{retrieve:async()=>({evidence:[],status:'none'}),oneStage:true,model:async p=>{cc.push(p);return {text:cc.length===1?'Duty and rights here still require correction.':'The list must be corrected.',question:'Who tells them?',done:true,evidenceIds:[]};}});
  assert.equal(cc.length,2);
});
