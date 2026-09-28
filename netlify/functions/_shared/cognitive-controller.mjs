import { randomUUID } from 'node:crypto';
import { catalog } from '../../../config/knowledge/cognitive/definitions.mjs';
import { dropCheckpointAsk, dropTrailingQuestion } from '../../../config/knowledge/cognitive/dangling-question.mjs';
import { loadKnowledgePrompt } from './knowledge-prompts.mjs';
export { catalog };
export const MAX_TEXT=12000, MAX_TURNS=500, MAX_BYTES=1000000;
export const ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const fault=(status,code,message)=>Object.assign(new Error(message),{status,code});
const copy=v=>structuredClone(v);
const words=s=>String(s||'').trim().split(/\s+/u).filter(Boolean).length;
const stamp=()=>new Date().toISOString();
const stampCompleted=s=>{if(!s.completedAt)s.completedAt=stamp();};
const COMPILE=new Set(['map','synthesis','convergence','weave','closing']);
// Per-protocol non-compile burst budgets (reviewable). Analytic stages get 180; Fates, Consilium dialogue and Tribunal stay short.
export const BURST_WORDS={
 fates:90,
 consilium:90,
 tribunal:90,
 mirror:90,
 refinery:180,
 cartographers:180,
 witness:{trace:250,patterns:120,recalibration:120},
 horizon:{ketill:180,alvar:180,sigrid:180},
};
// Tribunal depth is a word budget per single-pass voice: quick 1–2 sentences, standard one paragraph, deep extended.
export const TRIBUNAL_WORDS={quick:60,standard:BURST_WORDS.tribunal,deep:250};
export const TRIBUNAL_CLOSE='These are three reframes, not recommendations. You decide which, if any, is worth pursuing.';
const WITNESS_VERIFY='Does this reconstruction match your experience of how the thinking unfolded, and is anything missing, inaccurate or misrepresented?';
const SCOPE_QUESTION='This looks outside what this protocol does. Say how it fits to continue, or cancel and start the protocol that fits.';
const GATE_FALLBACK={confirm:'Does this hold as stated? Confirm it, or correct what is wrong.',answer:'What would you add or change before we continue?'};
const UNSOUND_CHOICE='The Breaker judges the thesis unsound on the available evidence. Should the Reforger rebuild the original thesis with its limits stated, or offer a reframed thesis labelled as a suggestion?';
const step=(speaker,stage=speaker,gate=null,extra={})=>{
 const compile=COMPILE.has(stage)||speaker==='weave';
 return {speaker,stage,gate,maxBursts:compile?1:3,burstWords:compile?425:90,...extra};
};
function thinTribunal(intake){
 const blob=[intake.problem,intake.entrenchment,intake.framing].filter(Boolean).join(' ');
 return words(blob)<40||[intake.problem,intake.entrenchment,intake.framing].some(v=>!v||words(v)<8);
}
// Spec-owned closing summary for protocols whose last voice is not a compiler.
const closing=()=>step('controller','closing',null,{maxBursts:1,burstWords:425});
function plan(id,mode,intake){
 const B=BURST_WORDS;
 if(id==='fates'){
  const perCycle=mode==='long'?4:3,cycles=mode==='long'?3:mode==='normal'?2:1;
  // Gated steps are confirm/verify/reflection only. Ordinary answer checkpoints come from a question in the burst model.
  // Briefing asks only about what the brief leaves open (up to two questions); a complete brief goes straight to the plan.
  const list=[step('lachesis','briefing',null,{maxBursts:2,burstWords:B.fates}),step('lachesis','plan','confirm',{maxBursts:1,burstWords:B.fates})];
  for(let c=0;c<cycles;c++){
   for(let t=0;t<perCycle;t++)list.push(step(t%2?'atropos':'clotho',`cycle-${c+1}-${t+1}`,null,{maxBursts:2,burstWords:125,stopWords:250}));
   if(c<cycles-1)list.push(step('lachesis',`interrogation-${c+1}`,'answer',{maxBursts:1,burstWords:B.fates}));
  }
  return [...list,step('lachesis','filter','confirm',{maxBursts:1,filter:true,burstWords:B.fates}),step('weave','weave',null,{maxBursts:1,burstWords:425}),step('lachesis','close','answer',{maxBursts:1,burstWords:B.fates})];
 }
 if(id==='horizon')return [step('ketill','ketill',null,{maxBursts:3,burstWords:B.horizon.ketill}),step('alvar','alvar',null,{maxBursts:3,burstWords:B.horizon.alvar}),step('sigrid','sigrid','answer',{maxBursts:1,burstWords:B.horizon.sigrid}),step('controller','map',null,{maxBursts:1,burstWords:mode==='brief'?425:700})];
 if(id==='refinery'){
  const voices=({full:['builder','breaker','reforger'],build:['builder'],break:['breaker'],reforge:['reforger'],'build-break':['builder','breaker'],'break-reforge':['breaker','reforger']})[mode];
  // Intake gate: the restated thesis is confirmed before anything is built.
  const gate=voices.includes('builder')?[step('controller','thesis','confirm',{maxBursts:1,burstWords:B.fates})]:[];
  return [...gate,...voices.map(s=>step(s,s,null,{burstWords:B.refinery})),closing()];
 }
 if(id==='cartographers'){
  // Interrogation is Miner/Cartographer only over supplied papers; passes 2 and 6 stop and ask.
  if(mode==='interrogation')return [...[['landscape','miner'],['contradictions','miner'],['concept-trees','miner'],['gaps','cartographer'],['methodology','miner'],['master-synthesis','cartographer'],['assumptions','miner'],['knowledge-map','cartographer'],['so-what','cartographer']].map(([s,who])=>step(who,s,s==='contradictions'||s==='master-synthesis'?'answer':null,s==='master-synthesis'?{maxBursts:1,burstWords:425}:{maxBursts:1,burstWords:B.cartographers})),closing()];
  return [...(mode==='direct'?[]:[step('surveyor',undefined,null,{burstWords:B.cartographers})]),step('miner',undefined,null,{burstWords:B.cartographers}),step('cartographer',undefined,null,{burstWords:B.cartographers}),closing()];
 }
 if(id==='mirror')return [step('controller','framing',mode==='deep'?'confirm':null,{maxBursts:1,burstWords:B.mirror}),step('retrospective',undefined,null,{burstWords:B.mirror,stopWords:150}),step('prospective',undefined,null,{burstWords:B.mirror,stopWords:120}),step('present','present','answer',{maxBursts:1,burstWords:100}),step('controller','synthesis',null,{maxBursts:1,burstWords:425})];
 if(id==='consilium')return [step('controller','framing','confirm',{maxBursts:1,burstWords:B.consilium}),step('principle','dialogue',null,{burstWords:B.consilium})];
 if(id==='witness'){
  const deep=mode==='deep';
  return [step('trace','trace','verify',{maxBursts:1,burstWords:B.witness.trace}),step('patterns',undefined,null,{burstWords:deep?180:B.witness.patterns,stopWords:deep?350:200}),step('recalibration',undefined,null,{burstWords:B.witness.recalibration,stopWords:200}),closing()];
 }
 // Missing prior attempts also earns a clarify: the attempted solution is the Inverter's primary evidence.
 const clarify=thinTribunal(intake||{})||!intake?.priorAttempts?[step('controller','clarify',null,{maxBursts:2,burstWords:B.tribunal,clarify:true})]:[];
 const depth=TRIBUNAL_WORDS[mode]??B.tribunal;
 return [...clarify,...['inverter','scaler','context-shifter'].map(v=>step(v,undefined,null,{maxBursts:1,burstWords:depth})),step('controller','convergence',null,{maxBursts:1,burstWords:425})];
}
export function createSession({id=randomUUID(),owner,protocolId,mode,intake={},requestId}){
 const def=catalog.find(d=>d.id===protocolId);if(!def)throw fault(400,'validation_error','Unknown protocol.');
 if(!ID_RE.test(id)||!ID_RE.test(requestId||''))throw fault(400,'validation_error','Valid session and request IDs required.');
 if(!intake||typeof intake!=='object'||Array.isArray(intake))throw fault(400,'validation_error','Intake must be an object.');
 mode=mode??def.defaultMode;if(!def.modes.some(m=>m.id===mode))throw fault(400,'validation_error','Unknown mode.');
 const data={};for(const f of def.intake){const value=intake[f.id];if(value!==undefined&&typeof value!=='string')throw fault(400,'validation_error',`${f.label} must be text.`);if((value?.length??0)>MAX_TEXT)throw fault(413,'input_limit',`${f.label} exceeds ${MAX_TEXT} characters.`);if(f.required&&!value?.trim())throw fault(400,'validation_error',`${f.label} is required.`);if(value?.trim()){if(f.options&&!f.options.some(o=>o.value===value))throw fault(400,'validation_error',`${f.label} has an invalid option.`);data[f.id]=value.trim();}}
 if(protocolId==='cartographers'&&/^(just curious|curious|anything)$/i.test(data.purpose))throw fault(400,'validation_error','A specific purpose is required.');
 if(protocolId==='cartographers'&&['direct','interrogation'].includes(mode)&&!data.sources)throw fault(400,'validation_error','Supplied source text is required in this mode.');
 if(protocolId==='refinery'&&data.inputType==='draft'&&!data.draft)throw fault(400,'validation_error','Draft text is required.');
 const now=stamp();const s={id,owner,protocolId,mode,intake:data,revision:0,status:'queued',stage:'intake',speaker:null,transcript:[],evidence:[],evidenceStatus:'Evidence retrieval pending.',checkpoint:null,allowedActions:['pause','cancel'],error:null,createdAt:now,updatedAt:now,steps:plan(protocolId,mode,data),cursor:0,burst:0,reopens:0,continueBurst:false,filterCaution:null,requests:{},dialogueCounts:{},answered:{},retrieved:false};
 return refresh(s);
}
function add(s,role,speaker,stage,text,evidenceIds=[],extra={}){if(s.transcript.length>=MAX_TURNS)throw fault(413,'session_limit','Session reached its 500-turn limit.');s.transcript.push({id:randomUUID(),role,speaker,stage,text,createdAt:stamp(),evidenceIds,...extra});}
export function canFinish(s){const min=s.mode==='extended'?2:1;return ['principle','consequence','virtue'].every(v=>(s.dialogueCounts[v]||0)>=min&&(s.answered[v]||0)>=1);}
function atFilter(s){return s.checkpoint&&s.steps[s.cursor]?.filter;}
// wrap is Fates-only and only before the filter (not at filter, reopen, weave or close).
function canWrap(s){
 if(s.protocolId!=='fates'||s.checkpoint?.kind!=='answer')return false;
 const st=s.steps[s.cursor];
 if(!st||st.filter||st.stage==='weave'||st.stage==='close'||String(st.stage).startsWith('reopen'))return false;
 const fi=s.steps.findIndex(x=>x.filter);
 return fi>=0&&s.cursor<fi;
}
function refresh(s){
 const waiting=s.status==='waiting',filter=atFilter(s);
 let actions;
 if(waiting){
  if(s.checkpoint.kind==='verify')actions=['confirm','correct','uncertain'];
  else if(s.checkpoint.kind==='reflection')actions=['reflect'];
  else if(filter)actions=[...(s.reopens<2?['confirm','reopen','close']:['confirm','close'])];
  else if(s.checkpoint.kind==='confirm')actions=['confirm','correct'];
  else {actions=['answer','decline'];if(canWrap(s))actions.push('wrap');}
  if(s.protocolId==='consilium'&&s.stage==='dialogue'&&canFinish(s))actions.push('finish');
  actions.push('pause','cancel');
 } else if(s.status==='paused')actions=['resume','cancel'];
 else if(s.status==='failed')actions=['retry','cancel'];
 else if(['queued','running'].includes(s.status))actions=['pause','cancel'];
 else actions=[];
 s.allowedActions=actions;
 if(s.protocolId==='mirror'&&['waiting','completed'].includes(s.status)&&!s.allowedActions.includes('correct'))s.allowedActions.push('correct');
 s.updatedAt=stamp();if(Buffer.byteLength(JSON.stringify(s))>MAX_BYTES)throw fault(413,'session_limit','Session storage limit reached. Download this session and start a new one.');return s;
}
export function publicSession(s){const keys=['id','protocolId','mode','intake','revision','status','stage','speaker','transcript','evidence','evidenceStatus','checkpoint','allowedActions','error','createdAt','updatedAt','completedAt','summary','writeBack','lastReviewDate','cadenceUnknown'];return Object.fromEntries(keys.map(k=>[k,copy(s[k])]).filter(([,v])=>v!==undefined));}
function nextDialogue(s,candidate){
 const voices=['principle','consequence','virtue'],max=s.mode==='extended'?24:12,total=Object.values(s.dialogueCounts).reduce((a,b)=>a+b,0);
 if(total>=max&&canFinish(s))return step('controller','map','reflection',{maxBursts:1,burstWords:425});
 const min=Math.min(...voices.map(v=>s.dialogueCounts[v]||0));let next=voices.includes(candidate)?candidate:voices.find(v=>(s.dialogueCounts[v]||0)===min);
 if(!total&&next==='virtue')next='principle';
 if((s.dialogueCounts[next]||0)>min+1)next=voices.find(v=>(s.dialogueCounts[v]||0)===min);
 return step(next,'dialogue',null,{burstWords:BURST_WORDS.consilium});
}
function jumpToFilter(s){
 const i=s.steps.findIndex(st=>st.filter);
 if(i<0)return;
 s.cursor=i;s.burst=0;s.continueBurst=false;s.filterCaution=null;
}
export function act(current,{action,text,revision,requestId}){
 if(!ID_RE.test(requestId||''))throw fault(400,'validation_error','Valid request ID required.');
 // Pause and cancel always apply to the latest state; a runner commit between poll and click must not swallow them.
 if(revision!==current.revision&&!['pause','cancel'].includes(action))throw fault(409,'revision_conflict','Session changed. Refresh before continuing.');
 if(!current.allowedActions.includes(action))throw fault(409,'action_not_allowed','This action is not allowed at the current checkpoint.');
 if(text!==undefined&&(typeof text!=='string'||text.length>MAX_TEXT))throw fault(413,'input_limit','Response exceeds the text limit.');
 if(['answer','correct','reflect','reopen'].includes(action)&&!text?.trim())throw fault(400,'validation_error','A response is required.');
 const s=copy(current);s.revision++;s.error=null;
 if(action==='pause'){s.resumeStatus=s.status;s.status='paused';s.lease=null;return refresh(s);}
 if(action==='cancel'){const ask=s.checkpoint?.question;s.status='cancelled';s.checkpoint=null;s.lease=null;const last=[...s.transcript].reverse().find(t=>t.role!=='user');if(last)last.text=dropCheckpointAsk(last.text,ask);return refresh(s);}
 if(action==='resume'){s.status=s.resumeStatus==='waiting'?'waiting':'queued';return refresh(s);}
 if(action==='retry'){s.status='queued';s.lease=null;return refresh(s);}
 if(action==='wrap'){add(s,'user','you',s.stage,text?.trim()||'Wrap to the filter.');jumpToFilter(s);s.continueBurst=false;s.burst=0;s.checkpoint=null;s.status='queued';return refresh(s);}
 if(action==='reopen'){
  add(s,'user','you',s.stage,text.trim());
  const filterTurn=[...s.transcript].reverse().find(t=>t.stage==='filter'&&t.role==='voice');
  const who=['clotho','atropos'].includes(filterTurn?.nextSpeaker)?filterTurn.nextSpeaker:/option|narrow/i.test(text)?'clotho':'atropos';
  const n=(s.reopens||0)+1;s.reopens=n;
  s.steps.splice(s.cursor+1,0,step(who,`reopen-${n}`,'answer',{maxBursts:2,burstWords:125,stopWords:250}),step('lachesis','filter','confirm',{maxBursts:1,filter:true}));
  s.cursor++;s.burst=0;s.continueBurst=false;s.checkpoint=null;s.status='queued';return refresh(s);
 }
 if(action==='close'&&atFilter(s)){add(s,'user','you',s.stage,text?.trim()||'Close the filter.');s.cursor++;s.burst=0;s.continueBurst=false;s.checkpoint=null;s.status='queued';return refresh(s);}
 add(s,'user','you',s.stage,text?.trim()||({confirm:'Confirmed.',uncertain:'Uncertain; proceed with reduced confidence.',decline:'Explicitly declined.',finish:'Ready for the convergence and conflict map.'}[action]));
 if(action==='reflect'){s.status='completed';s.checkpoint=null;stampCompleted(s);return refresh(s);}
 if(action==='correct'){
  if(s.protocolId==='witness'){s.cursor=0;s.burst=0;s.verification=null;}
  else if(s.protocolId==='mirror'){s.intake.conflict=text.trim();s.steps=plan(s.protocolId,s.mode,s.intake);s.cursor=0;s.burst=0;add(s,'controller','controller','correction','The prior reading is superseded. Restarting from the corrected conflict.');}
  else {s.cursor=Math.max(0,s.cursor-1);s.burst=0;}
  s.continueBurst=false;
 } else if(s.protocolId==='witness'&&s.checkpoint?.kind==='verify')s.verification=action;
 else if(action==='confirm'&&atFilter(s)){
  const filterTurn=[...s.transcript].reverse().find(t=>t.stage==='filter'&&t.role==='voice');
  s.filterCaution=filterTurn?.text||'Hold flagged elements with caution.';
  s.cursor++;s.burst=0;s.continueBurst=false;
 } else if(s.protocolId==='consilium'&&s.stage==='dialogue'){
  s.answered[s.speaker]=(s.answered[s.speaker]||0)+1;
  // continueBurst is the source of truth: mid-burst answers stay on the same dialogue step.
  if(s.continueBurst){s.continueBurst=false;}
  else {
   s.steps.push(action==='finish'?step('controller','map','reflection',{maxBursts:1,burstWords:425}):nextDialogue(s,s.nextSpeaker));
   s.burst=0;s.continueBurst=false;
  }
 } else if(s.stage==='clarify'&&text?.trim()){
  s.intake.clarifications=[s.intake.clarifications,text.trim()].filter(Boolean).join('\n');
  s.continueBurst=false;
 } else if(s.continueBurst){
  s.continueBurst=false;
 } else s.continueBurst=false;
 s.checkpoint=null;s.status='queued';return refresh(s);
}
function stopRemaining(s,st,stage){
 if(!st.stopWords)return Infinity;
 const used=s.transcript.filter(t=>t.role==='voice'&&t.stage===stage).reduce((n,t)=>n+words(t.text),0);
 return st.stopWords-used;
}
function stopBudget(s,st,stage){
 const remaining=stopRemaining(s,st,stage);
 return Number.isFinite(remaining)?Math.max(1,Math.min(st.burstWords||90,remaining)):st.burstWords||90;
}

/** Hard speaker lock so each voice keeps its writing register; protocol.md alone is not enough. */
function speakerRegister(s, speaker, stage, {finalBurst}={}){
 const id=s.protocolId;
 if(id==='fates'){
  if(speaker==='clotho')return `You are Clotho only, the Spinner. Hot, breathless, associative; short clauses and fragments; at most one Greek spark defined in plain English. ${finalBurst?'Final burst: close without a question.':'Ask one load-bearing question in character and set done false when you will continue.'} Never write Atropos, Lachesis or The Weave.`;
  if(speaker==='atropos')return `You are Atropos only, the Cutter. Dry, surgical, epistemic; demand definition or evidence; no exclamation marks. ${finalBurst?'Final burst: close without a question.':'Ask one load-bearing question in character and set done false when you will continue.'} Never write Clotho, Lachesis or The Weave.`;
  if(speaker==='lachesis')return `You are Lachesis only, the Measurer. Level, compact, numbered options; convert ambiguity into choices. ${finalBurst&&!stage.includes('filter')?'Final burst: close without a question.':'Ask early, stop at the decision point.'} ${stage==='briefing'?'Read the whole brief, including any "Field: value" lines. Ask only about audience, constraints, success or prior attempts if the brief truly leaves one open; if nothing is open, ask nothing and set done true.':''}${stage==='plan'?`Run length selected is ${s.mode}; report it, do not offer to change it. A different length needs a new run.`:''} Never generate ideas or argue a side. Never write Clotho or Atropos.`;
  if(speaker==='weave')return 'You are The Weave only: witness and map. Balanced sentences, no advocacy, no new idea, no ranking the Fates.';
 }
 if(id==='horizon'){
  if(speaker==='ketill')return 'You are Ketill only. Near horizon only: stop at two years, even if Adam named a longer one. Three to seven forks in consecutive sentences. For each fork say what it feeds later that will not show yet (Dörner: delayed feedback and side effects). Do not number them and do not say fork one. Miðgarðr speech, your own Old Norse words, one physical action, one of your names for Adam. You may ask one steering question per burst in character. Describe what each fork opens or closes; never an imperative to Adam (push, take, choose, go for). No plan and no other voice\'s lines.';
  if(speaker==='alvar')return 'You are Alvar only. Far horizon, work backwards, three to seven preconditions in consecutive sentences. Walk down the layers (Inayatullah): the visible event, the system that produces it, the worldview that holds that system, and the story Adam tells about himself; name at least one precondition below the event layer. Do not number them and do not say first, second or third. Your own Old Norse and mythic territory. You may answer Ketill. You may ask one steering question per burst in character. State requirements time will enforce, never an instruction to Adam. Do not write his or Sigrid\'s lines. Invent any memory. Do not copy one from the instructions.';
  if(speaker==='sigrid')return 'You are Sigrid only. One turn of the iron ring. Contrast the stated future (or, when none was given, the future Alvar extrapolated, named as extrapolated) with the present obstacle Ketill and Alvar exposed (Oettingen: mental contrasting). Group the findings into the two to four gaps that carry the most weight; each is a deliberate trade-off, unexamined drift, or unclassified. Ask that and stop. No reassurance, no advice and no other voice\'s lines.';
  if(speaker==='controller')return 'You are the map compiler, not a fourth voice. Preserve each speaker\'s wording and every contradiction. No praise, plan, or recommendation; if a voice phrased a fork as an instruction, report it as a fork. If originalInput has no desiredFuture, the stated-future section says none was given.';
 }
 if(id==='mirror'){
  if(speaker==='retrospective')return `You are Gu Jian only, the Retrospective. Speak in his Zhou-hall register: past tense, balanced pairs, ji/xing/shi from your own word list, sample before pattern. One instance is never a trend. ${finalBurst?'Final burst: close without a question.':'Ask one steering question in character and set done false.'} No other voice's lines.`;
  if(speaker==='prospective')return `You are Wang Yuan only, the Prospective. Speak in her register: conditional, Adam's own words, zhi/yuan/xiang/bei. Never invent an aspiration: cite one only if it appears in originalInput, the conversation or a knownContext item, and quote its words; otherwise name the silence. ${finalBurst?'Final burst: close without a question.':'Ask one short real question in character and set done false.'} You may answer Gu Jian. Do not write Zheng Ming's lines.`;
  if(speaker==='present')return `You are Zheng Ming only, the Present. Level present tense, rectify the name, then one seven-day question and stop. ${s.intake.timescale==='long-arc'?'Ask what he is willing to sit with, tolerate or protect this week.':'Ask what he is actually willing to do in the next seven days.'} No other voice's lines.`;
  if(speaker==='controller'&&stage==='framing')return `You are the framer, not a fourth voice. Name the conflict in one or two sentences: the choice, the domain, and the two values in tension. ${s.mode==='deep'?'Ask Adam to confirm or correct the framing and stop.':'State that a correction restarts the run. Do not ask a question.'}`;
  if(speaker==='controller')return 'You are the compiler, not a fourth voice. Structure and condense only. Preserve each speaker\'s wording. No new analysis or recommendation.';
 }
 if(id==='refinery'){
  if(speaker==='builder')return `You are Bezalel the Builder only. Warm affirmative Toulmin structure; name claim, grounds, warrant, backing, qualifier. Build the confirmed thesis as stated; never propose a narrowed or reframed thesis (the qualifier states its reach). ${finalBurst?'Final burst: close without a question.':'Ask only when a joint is missing; one question max.'} Never write Breaker or Reforger.`;
  if(speaker==='breaker')return `You are Beruriah the Breaker only. Short, dry, steelmanned critique; name the weakest joint. ${finalBurst?'Final burst: close without a question.':'Ask only when evidence is needed; one question max.'} Never rebuild or soften. Never write Builder or Reforger.`;
  if(speaker==='reforger')return `You are Nechemya the Reforger only. Level rebuild accounting for each Breaker weakness. ${finalBurst?'Final burst: close without a question.':'Ask only for a real choice Adam must make.'} ${s.transcript.some(t=>t.stage==='thesis-warning')?'The thesis was flagged unsound. Follow Adam\'s answer to that warning: rebuild the original with its limits stated, or offer a reframe labelled as a suggestion, never as the original refined.':''}${s.mode==='reforge'?'Reforge-only: say this rests on supplied prior work, not invented Builder or Breaker passes.':''} Any thesis that differs from the confirmed one, including one hinted earlier, is introduced as "Suggested reframe:" and kept separate from the refined original. Never merely rephrase. Never write Builder or Breaker.`;
  if(speaker==='controller'&&stage==='thesis')return 'You are the intake clerk, not a voice. Restate the thesis, name the understood context and audience in one or two sentences, then ask Adam to confirm or correct. Build nothing.';
  if(speaker==='controller')return 'You are the closing compiler, not a fourth voice. State the confirmed thesis, the passes actually run, the rebuilt case, weaknesses repaired and accepted, limits and unresolved tensions (teiku where honest), confidence with basis, and evidence gaps as actions for Adam. Add nothing new.';
 }
 if(id==='cartographers'){
  if(speaker==='surveyor')return `You are Captain Josiah Everly the Surveyor only. Map terrain; understate; never rank. ${finalBurst?'Final burst: close without a question.':'Close with one mining question when you will continue.'} Never write Miner or Cartographer.`;
  // Interrogation passes are fixed: only the gated passes ask, so an ungated question would have nowhere to be answered.
  if(speaker==='miner')return `You are Miss Harriet Quarrington the Miner only. Numbered citation slips; no cross-source synthesis. ${s.mode==='interrogation'?'Interrogation pass: do this pass only. Ask nothing unless this is a checkpoint.':finalBurst?'Final burst: close without a question.':'Ask whether to continue mining or draw.'} Never write Surveyor or Cartographer.`;
  if(speaker==='cartographer')return `You are Mr Ambrose Meridith the Cartographer only. Name relations from Miner slips; preserve white space. ${finalBurst?'Final burst: close without a question.':'Ask only for genuine ambiguity.'} Never invent a source. Never write Surveyor or Miner.`;
  if(speaker==='controller')return `You are the closing compiler, not a fourth voice. Close for ${s.mode} mode: terrain surveyed, extractions, the representation drawn, gaps, limitations and at most five open threads, each traced to what the voices said. Add no source, relation or conclusion.`;
 }
 if(id==='consilium'){
  if(speaker==='principle')return 'You are Gaius Officius the Principle only. Opening: “Duty and rights here require …” Austere duty language; no consequentialism. Ask only for genuine ambiguity. Never write Consequence or Virtue.';
  if(speaker==='consequence')return 'You are Lucius Eventus the Consequence only. Opening: “The best outcome for all affected parties is …” If/then chains; no duty language. Ask only for genuine ambiguity. Never write Principle or Virtue.';
  if(speaker==='virtue')return 'You are Titus Honestus the Virtue only. Opening: “This choice shapes you into the kind of person who …” Warm second person; cite only stated aspirations. Ask precise personal questions. Never write Principle or Consequence.';
 }
 if(id==='witness'){
  if(speaker==='trace')return 'You are Sati the Trace only. Reconstruct sequence without story or evaluation. If the intake and conversation give no sequence of steps to reconstruct, set needsInput true and ask one question for the actual sequence instead of tracing. End with the mandatory verification question when this is the verify gate. Never name a pattern. Never write Pattern Match or Recalibration.';
  if(speaker==='patterns')return 'You are Pañña the Pattern Match only. Sound thinking is the null hypothesis; baseline before patterns. Never diagnose. Never write Trace or Recalibration.';
  if(speaker==='recalibration')return 'You are Upekkhā the Recalibration only. Calibrate confidence and one disposition. Do not prescribe a replacement decision. Never write Trace or Pattern Match.';
  if(speaker==='controller')return 'You are the closing compiler, not a fourth stage. State the audited target, the verified trace in brief, active patterns (or the clean baseline), calibrated confidence and disposition, then gaps and limitations. No new analysis and no advice.';
 }
 if(id==='tribunal'){
  if(speaker==='inverter')return 'You are Counselor Frank Delacorte the Inverter only. First test whether the attempted solutions keep the problem alive (Watzlawick, Weakland and Fisch); then test hidden function, and close on something observable stated as a statement, not a question. One pass; no questions; never reference other reframes.';
  if(speaker==='scaler')return 'You are Special Master Ruth Abernathy the Scaler only. One downscale and one upscale; no questions; never reference other reframes.';
  if(speaker==='context-shifter')return 'You are Judge Hollis Venable the Context Shifter only. Change setting; label realistic vs revealing; no questions; never reference other reframes.';
  if(speaker==='controller'&&stage==='clarify')return `Ask up to two short steering questions that resolve thin or ambiguous intake.${s.intake.priorAttempts?'':' One of them asks what has already been tried and what happened.'} No reframe yet.`;
  if(speaker==='controller')return 'You are the Tribunal compiler only. Convergence note at most four sentences; never rank or combine reframes.';
 }
 return '';
}

export function buildPrompt(s,currentStep){
 const {speaker,stage,gate}=currentStep;
 const shared=loadKnowledgePrompt('cognitive/shared.md'),protocol=loadKnowledgePrompt(`cognitive/${s.protocolId}.md`);
 const isolated=s.protocolId==='tribunal'&&speaker!=='controller';
 const previous=isolated?[]:s.transcript;
 const maxBursts=currentStep.maxBursts??3,burst=(s.burst||0)+1;
 const budget=stopBudget(s,currentStep,stage);
 // A burst that will spend the rest of its stop budget is final even below maxBursts.
 const finalBurst=burst>=maxBursts||stopRemaining(s,currentStep,stage)<=(currentStep.burstWords||90);
 const knownContext=s.evidence.filter(e=>e.kind==='knowledge'||e.kind==='knowledge_hub_note'||e.kind==='central_node'||e.kind==='web'||String(e.kind||'').startsWith('web')||String(e.id||'').startsWith('web:'));
 const continuation=burst>1?`Continuation burst ${burst} of ${maxBursts}. The user answered your previous question. Continue from that answer. Do not repeat prior analysis. Keep the same assigned voice register as the first burst.`:`Burst ${burst} of ${maxBursts}. Default length about ${budget} words.`;
 const closeRule=finalBurst&&!gate?'This is your final burst for this step. Close without asking a question.':'';
 const questionRule=gate?`This is a ${gate} checkpoint. Return one targeted question and STOP. Set done true.`:`One question per burst maximum. If you ask a question and will continue later, set done false. If this contribution is complete, set done true. ${closeRule}`;
 // No live search inside a voice turn: each re-ask repeated the search and stalled Refinery for minutes.
 // Web findings arrive once, at retrieval, as knownContext.
 const register=speakerRegister(s,speaker,stage,{finalBurst});
 const instructions=[`Assigned speaker: ${speaker}. Assigned stage: ${stage}. Mode: ${s.mode}. Maximum ${budget} words including question.`,continuation,questionRule,'Speak in conversation. Never mention Knowledge Hub notes, retrieval, evidence status, self-report, or a missing archive. If knownContext is relevant, use it as something you already know.',register,s.protocolId==='fates'&&!COMPILE.has(stage)?'A prior confirmed plan supplies fixed creative/critical roles. At most 250 words across this stop.':'',s.protocolId==='fates'&&stage==='weave'&&s.filterCaution?`Hold with caution from the filter: ${s.filterCaution}`:'',s.protocolId==='consilium'&&stage==='dialogue'?`${s.dialogueCounts[speaker]?'Already spoke: no repeated signature opening.':'First contribution: use your signature opening.'} ${!s.answered[speaker]&&(s.dialogueCounts[speaker]||0)>=1?'User has not yet responded to you. Ask one meaningful decision/fact question now.':''}`:'',s.protocolId==='horizon'&&speaker==='alvar'&&s.intake.desiredFuture?'A desired future was supplied. Work backwards from it. Do not use the extrapolation fallback.':'',s.protocolId==='horizon'&&speaker==='alvar'&&!s.intake.desiredFuture?'Fallback required: extrapolated from current trajectory, not from a stated goal. Moderate-to-low confidence ceiling. No desired future was given in this run: never call anything "the stated future", even if the brief or knownContext hints at ambitions.':'',s.protocolId==='mirror'&&s.mode==='deep'&&speaker!=='controller'?'Deep mode: give each claim a confidence (high, moderate or low) inside the sentence.':'',s.protocolId==='witness'&&speaker==='patterns'?`Trace verification: ${s.verification}. Sound thinking is the null hypothesis. Uncertain verification lowers confidence.`:'',s.protocolId==='fates'&&stage==='filter'?'Name actual fallacies only. Set nextSpeaker to atropos for unsupported claims or clotho for narrowed options when a reopen may help. Ask whether to hold with caution, reopen, or close.':''].filter(Boolean).join('\n');
 const originalInput=isolated||s.protocolId==='tribunal'?{...s.intake}:s.intake;
 const lastReviewDate=s.lastReviewDate||s.intake?.lastReviewDate;
 const frequencyJustification=s.intake?.frequencyJustification;
 const cadence=s.protocolId==='horizon'&&(lastReviewDate||frequencyJustification)?{
  ...(lastReviewDate?{lastReviewDate}:{}),
  ...(frequencyJustification?{frequencyJustification}:{})
 }:null;
 return {speaker,stage,gate,wordBudget:budget,burst,maxBursts,finalBurst,tools:undefined,system:[shared,protocol,instructions].join('\n\n'),user:JSON.stringify({originalInput,mode:s.mode,...(cadence?{cadence}:{}),...(knownContext.length?{knownContext}:{}),...(!isolated?{conversation:previous,verification:s.verification??null}:{})})};
}
// Voices are prompted for JSON; the provider adapter streams that payload as text.
// Models often put literal newlines inside strings, which JSON.parse rejects.
function repairJsonStrings(s){
 let out='',inString=false,escape=false;
 for(const ch of s){
  if(inString){
   if(escape){out+=ch;escape=false;continue;}
   if(ch==='\\'){out+=ch;escape=true;continue;}
   if(ch==='"'){out+=ch;inString=false;continue;}
   const code=ch.charCodeAt(0);
   if(code<32){out+=ch==='\n'?'\\n':ch==='\r'?'\\r':ch==='\t'?'\\t':`\\u${code.toString(16).padStart(4,'0')}`;continue;}
   out+=ch;continue;
  }
  if(ch==='"')inString=true;
  out+=ch;
 }
 return out;
}
function voiceText(parsed){
 if(typeof parsed.text==='string')return parsed.text;
 if(Array.isArray(parsed.text))return parsed.text.filter(part=>typeof part==='string').join('\n');
 return '';
}
// Malformed or truncated voice JSON: recover the text and question fields instead of showing raw JSON.
function salvageField(slice,name){
 const key=slice.indexOf(`"${name}"`);if(key<0)return null;
 const colon=slice.indexOf(':',key+name.length+2);if(colon<0)return null;
 let i=colon+1;while(i<slice.length&&/\s/.test(slice[i]))i++;
 if(slice[i]!=='"')return null;
 let out='';
 for(i++;i<slice.length;i++){
  const ch=slice[i];
  if(ch==='\\'){const n=slice[++i];out+=n==='n'?'\n':n==='t'?'\t':n==='r'?'':n??'';continue;}
  if(ch==='"')break;
  out+=ch;
 }
 return out;
}
function salvageFields(slice){
 const text=salvageField(slice,'text');if(!text?.trim())return null;
 return {text,question:salvageField(slice,'question'),done:!/"done"\s*:\s*false/.test(slice)};
}
function parseVoice(raw){
 if(!raw||typeof raw!=='object'||typeof raw.text!=='string')return raw;
 const trimmed=raw.text.trim();
 const fenced=trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
 const candidate=fenced?.[1]?.trim()??trimmed;
 const start=candidate.indexOf('{'),end=candidate.lastIndexOf('}');
 if(start<0)return raw;
 // No closing brace means truncated JSON: keep the tail so the salvage below can still recover text.
 const slice=end>start?candidate.slice(start,end+1):candidate.slice(start);
 let parsed;
 try{parsed=JSON.parse(slice);}
 catch{try{parsed=JSON.parse(repairJsonStrings(slice));}catch{parsed=salvageFields(slice);if(!parsed)return raw;}}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return raw;
 const text=voiceText(parsed),question=typeof parsed.question==='string'?parsed.question:parsed.question??null;
 if(!text&&typeof question!=='string')return raw;
 const done=parsed.done===false?false:true;
 return {...raw,...parsed,text:text||question,question:question??null,done,evidenceIds:Array.isArray(parsed.evidenceIds)?parsed.evidenceIds:(raw.evidenceIds??[])};
}
function sentenceCount(text,question){
 const blob=text+(question&&!text.includes(question)?` ${question}`:'');
 return (blob.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)||[]).length;
}
function trimToBudget(text,question,budget,{sentences=null}={}){
 let t=text.trim(),q=question;
 if(sentences!=null){
  let parts=(t+(q&&!t.includes(q)?` ${q}`:'')).match(/[^.!?]+[.!?]+|[^.!?]+$/gu)||[];
  while(parts.length>sentences)parts.pop();
  const joined=parts.join('').trim();
  if(q&&joined.includes(q))return {text:joined.replace(q,'').trim()||joined,question:q,trimmed:true};
  return {text:joined,question:q,trimmed:true};
 }
 const qCost=words(q&&!t.includes(q)?q:'');
 const room=Math.max(1,budget-qCost);
 while(words(t)>room){
  const parts=t.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)||[];
  if(parts.length<=1){t=t.split(/\s+/u).slice(0,room).join(' ');break;}
  parts.pop();t=parts.join('').trim();
 }
 return {text:t,question:q,trimmed:true};
}
function validateOutput(raw,s,p,{allowTrim=false}={}){
 raw=parseVoice(raw);
 if(!raw||typeof raw.text!=='string'||!raw.text.trim())throw fault(502,'invalid_model_output','The voice returned no usable text. Retry this stage.');
 if(raw.question!=null&&typeof raw.question!=='string')throw fault(502,'invalid_model_output','The question format was invalid.');
 let text=raw.text.trim(),question=raw.question?.trim()||null,trimmed=false;
 // A voice can use a question mark while reasoning. Only treat a final
 // interrogative sentence as a checkpoint request, and retain its analysis.
 if(!question&&(p.gate||p.stage==='dialogue')){const match=text.match(/(?:^|[\n.!])\s*([^\n.!?][^?\n.!]*\?)\s*$/u);if(match){question=match[1].trim();text=text.slice(0,match.index+(match[0].startsWith('\n')?1:0)).trim();}}
 const ids=raw.evidenceIds??[];if(!Array.isArray(ids)||ids.some(id=>!s.evidence.some(e=>e.id===id)))throw fault(502,'invalid_evidence','A voice referenced unavailable evidence.');
 if(/https?:\/\//i.test(text))throw fault(502,'invalid_evidence','A voice returned an unverified source link.');
 const quotes=raw.quotes??[];if(!Array.isArray(quotes))throw fault(502,'invalid_evidence','Invalid source quotation format.');
 for(const quote of quotes){const e=s.evidence.find(e=>e.id===quote.evidenceId);if(!e||typeof quote.text!=='string'||!quote.text||!e.text.includes(quote.text))throw fault(502,'invalid_evidence','A source quotation did not match the evidence.');if(!ids.includes(e.id))ids.push(e.id);text+=`\n\n> ${quote.text}\n[Source: ${e.id}]`;}
 const total=words(text)+words(question&&!text.includes(question)?question:'');
 const ceiling=Math.floor(p.wordBudget*1.25);
 const consiliumOver=s.protocolId==='consilium'&&p.stage==='dialogue'&&sentenceCount(text,question)>5;
 if(total>ceiling||consiliumOver){
  if(allowTrim){
   const cut=consiliumOver?trimToBudget(text,question,p.wordBudget,{sentences:5}):trimToBudget(text,question,p.wordBudget);
   text=cut.text;question=cut.question;trimmed=true;
  } else {
   const detail=consiliumOver?`${sentenceCount(text,question)} sentences, limit 5. Rewrite shorter and keep your question.`:`${total} words, limit ${p.wordBudget}. Rewrite shorter and keep your question.`;
   throw fault(502,'voice_limit',detail);
  }
 }
 const done=raw.done===false?false:true;
 return {...raw,text,question,done,trimmed,evidenceIds:ids,nextSpeaker:raw.nextSpeaker};
}
const HORIZON_ADVICE=/(?:^|[.!?]\s+)(?:Push|Take|Ask for|Go for|Choose|Consider|Apply for|Pursue|Seek|Start|Stop|Make sure)\b|\byou (?:should|must|need to|ought to)\b/i;
// Loose on purpose: "Duty and rights here still require…" is the same opener.
const CONSILIUM_OPENERS={principle:/^\s*Duty and rights here\b/i,consequence:/^\s*The best outcome for all\b/i,virtue:/^\s*This choice shapes you\b/i};
// Deterministic checks for rules the model tends to break; each earns one re-ask.
function lintHint(s,p,result){
 if(s.protocolId==='horizon'&&['ketill','alvar','sigrid','controller'].includes(p.speaker)&&HORIZON_ADVICE.test(result.text))return 'Your previous reply told Adam what to do. Rewrite every instruction as a fork or requirement: what the path opens, closes or will cost. No imperatives to Adam.';
 if(s.protocolId==='consilium'&&p.stage==='dialogue'&&(s.dialogueCounts[p.speaker]||0)>=1&&CONSILIUM_OPENERS[p.speaker]?.test(result.text))return 'You already used your signature opening. Begin differently, answering what was just said.';
 return null;
}
const QUESTION_HINT='Your previous reply had no question. End this burst with exactly one question in character, returned in the question field.';
async function callVoice(model,s,p,{requireQuestion=false}={}){
 let hint='',raw,asked=false,linted=false;
 for(let attempt=0;attempt<4;attempt++){
  const prompt=hint?{...p,system:`${p.system}\n${hint}`}:p;
  // Provider transport failures are not retried here; the service marks the stage failed for an explicit retry.
  raw=await model(prompt);
  try{
   const result=validateOutput(raw,s,p,{allowTrim:attempt>=2});
   // A missing required question earns one re-ask; after that the controller falls back rather than failing the run.
   if(requireQuestion&&!result.question&&!result.outOfScope&&!asked){asked=true;hint=QUESTION_HINT;continue;}
   const lint=lintHint(s,p,result);
   if(lint&&!linted){linted=true;hint=lint;continue;}
   return result;
  }
  catch(err){
   if(err.code==='voice_limit'&&attempt<2){hint=err.message;continue;}
   if(err.code==='voice_limit')return validateOutput(raw,s,p,{allowTrim:true});
   if(attempt===0&&err.code!=='voice_limit'){hint='Previous output was invalid. Return one valid JSON object for this stage.';continue;}
   throw err;
  }
 }
 return validateOutput(raw,s,p,{allowTrim:true});
}
export async function advance(current,{model,retrieve,onProgress=async()=>{},oneStage=false}={}){
 if(!['queued','running'].includes(current.status))return current;
 let s=copy(current);s.status='running';
 if(!s.retrieved){
  const direct=s.protocolId==='cartographers'&&['direct','interrogation'].includes(s.mode);
  const r=direct?{evidence:[],status:'Direct source mode: search skipped; supplied sources only.'}:await retrieve(s);
  s.evidence=Array.isArray(r.evidence)?r.evidence:[];s.evidenceStatus=r.status;
  for(const [key,value]of Object.entries(s.intake))if(value)s.evidence.push({id:`input-${key}`,kind:'self-report',title:key,text:value});
  s.retrieved=true;s.revision++;await onProgress(refresh(s));
 }
 while(s.cursor<s.steps.length&&s.status==='running'){
  const st=s.steps[s.cursor];s.stage=st.stage;s.speaker=st.speaker;
  const p=buildPrompt(s,st);
  // Protocols that require an in-character question on non-final ungated bursts.
  const mustAsk=(s.protocolId==='mirror'&&['retrospective','prospective'].includes(st.speaker))
   ||(s.protocolId==='fates'&&['clotho','atropos','lachesis'].includes(st.speaker)&&!['filter','weave','briefing'].includes(st.stage));
  const consiliumOwes=s.protocolId==='consilium'&&st.stage==='dialogue'&&!s.answered[st.speaker]&&(s.dialogueCounts[st.speaker]||0)>=1;
  const requireQuestion=(Boolean(st.gate)&&st.gate!=='verify')||(mustAsk&&!p.finalBurst)||consiliumOwes;
  const result=await callVoice(model,s,p,{requireQuestion});
  let question=result.question;
  // A trace with no sequence to reconstruct asks for it (at most twice) instead of verifying an empty reconstruction.
  const traceNeedsInput=st.gate==='verify'&&result.needsInput&&Boolean(result.question)&&(s.burst||0)<2;
  if(st.gate==='verify'&&!traceNeedsInput)question=WITNESS_VERIFY;
  // Fallbacks keep the run moving when a voice still omits a required question after its re-ask.
  if(st.gate&&!question&&!result.outOfScope)question=GATE_FALLBACK[st.gate]||GATE_FALLBACK.answer;
  // Tribunal voices speak once and ask nothing; only the controller clarifies.
  if(s.protocolId==='tribunal'&&st.speaker!=='controller')question=null;
  if(s.protocolId==='consilium'&&st.stage==='dialogue'){
   s.dialogueCounts[st.speaker]=(s.dialogueCounts[st.speaker]||0)+1;s.nextSpeaker=result.nextSpeaker;
   if(!question&&!s.answered[st.speaker]&&s.dialogueCounts[st.speaker]>=2){const name=catalog.find(d=>d.id==='consilium').voices.find(v=>v.id===st.speaker)?.name||st.speaker;question=`What is your response to ${name}?`;}
  }
  s.burst=(s.burst||0)+1;
  const hardGate=st.gate&&st.gate!=='answer';
  // Final ungated burst must close without asking, even if the model ignored the prompt.
  if(p.finalBurst&&!st.gate)question=null;
  // needsInput holds the same step open for the answer, like done:false.
  const done=(result.done!==false&&!result.needsInput)||(!question&&!st.gate);
  let mayContinue=(!hardGate&&question&&!done&&!p.finalBurst)||traceNeedsInput;
  let output=result.text;if(question&&!output.includes(question))output+=`\n\n${question}`;
  // No checkpoint means no reply box: a closing question in the text would dangle unanswerable.
  if(!question&&!result.outOfScope)output=dropTrailingQuestion(output);
  if(s.protocolId==='tribunal'&&st.stage==='convergence'&&!output.includes(TRIBUNAL_CLOSE))output+=`\n\n${TRIBUNAL_CLOSE}`;
  add(s,st.speaker==='controller'?'controller':'voice',st.speaker,st.stage,output,result.evidenceIds,{trimmed:result.trimmed||undefined,done,nextSpeaker:result.nextSpeaker});
  s.revision++;
  if(s.protocolId==='refinery'&&st.speaker==='breaker'&&result.thesisUnsound){
   add(s,'controller','controller','thesis-warning','The Breaker flagged the thesis as fundamentally unsound. Any reframe from the Reforger must be labelled as a suggestion distinct from the original.');
   // The Reforger waits for Adam's choice between an original rebuild and a labelled reframe.
   if(s.steps[s.cursor+1]?.speaker==='reforger'){question=UNSOUND_CHOICE;mayContinue=false;}
  }
  if(result.outOfScope){
   // A voice named a scope mismatch. The run holds on this step; Adam clarifies to continue or cancels. The model never ends a run.
   s.status='waiting';s.checkpoint={kind:'answer',question:SCOPE_QUESTION};s.continueBurst=true;
  }
  else if(s.protocolId==='witness'&&result.distress){s.status='paused';s.resumeStatus='waiting';s.checkpoint={kind:'answer',question:'The audit has landed hard. Would you like to stop, continue with softer framing, or take this to Dr Vera Lenz?'};s.continueBurst=false;}
  else if(question){
   s.status='waiting';s.checkpoint={kind:traceNeedsInput?'answer':st.gate||'answer',question};s.continueBurst=mayContinue;
   // Stay on the step for burst continuations and the filter (actions decide). Otherwise advance so the answer lands on the next step.
   if(!mayContinue&&!st.filter){s.cursor++;s.burst=0;}
  } else {
   s.cursor++;s.burst=0;s.continueBurst=false;
   if(s.protocolId==='consilium'&&st.stage==='dialogue')s.steps.push(nextDialogue(s,result.nextSpeaker));
  }
  if(s.cursor>=s.steps.length&&s.status==='running'){s.status='completed';stampCompleted(s);}
  if(oneStage&&s.status==='running')s.status='queued';
  s=refresh(s);await onProgress(s);
  if(oneStage)break;
 }
 if(s.status==='running'){s.status='completed';stampCompleted(s);}
 return refresh(s);
}
