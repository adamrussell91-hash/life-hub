import { randomUUID } from 'node:crypto';
import { catalog } from '../../../config/knowledge/cognitive/definitions.mjs';
import { loadKnowledgePrompt } from './knowledge-prompts.mjs';
export { catalog };
export const MAX_TEXT=12000, MAX_TURNS=500, MAX_BYTES=1000000;
export const ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const fault=(status,code,message)=>Object.assign(new Error(message),{status,code});
const copy=v=>structuredClone(v);
const words=s=>String(s||'').trim().split(/\s+/u).filter(Boolean).length;
const stamp=()=>new Date().toISOString();
const COMPILE=new Set(['map','synthesis','convergence','weave']);
// Per-protocol non-compile burst budgets (reviewable). Analytic stages get 180; Fates, Consilium dialogue and Tribunal stay short.
export const BURST_WORDS={
 fates:90,
 consilium:90,
 tribunal:90,
 mirror:90,
 refinery:180,
 cartographers:180,
 witness:{trace:90,patterns:180,recalibration:180},
 horizon:{ketill:180,alvar:180,sigrid:90},
};
const step=(speaker,stage=speaker,gate=null,extra={})=>{
 const compile=COMPILE.has(stage)||speaker==='weave';
 return {speaker,stage,gate,maxBursts:compile?1:3,burstWords:compile?425:90,...extra};
};
function thinTribunal(intake){
 const blob=[intake.problem,intake.entrenchment,intake.framing].filter(Boolean).join(' ');
 return words(blob)<40||[intake.problem,intake.entrenchment,intake.framing].some(v=>!v||words(v)<8);
}
function plan(id,mode,intake){
 const B=BURST_WORDS;
 if(id==='fates'){
  const perCycle=mode==='long'?4:3,cycles=mode==='long'?3:mode==='normal'?2:1;
  // Gated steps are confirm/verify/reflection only. Ordinary answer checkpoints come from a question in the burst model.
  const list=[step('lachesis','briefing','answer',{maxBursts:1,burstWords:B.fates}),step('lachesis','briefing','answer',{maxBursts:1,burstWords:B.fates}),step('lachesis','plan','confirm',{maxBursts:1,burstWords:B.fates})];
  for(let c=0;c<cycles;c++){
   for(let t=0;t<perCycle;t++)list.push(step(t%2?'atropos':'clotho',`cycle-${c+1}-${t+1}`,null,{maxBursts:2,burstWords:125,stopWords:250}));
   if(c<cycles-1)list.push(step('lachesis',`interrogation-${c+1}`,'answer',{maxBursts:1,burstWords:B.fates}));
  }
  return [...list,step('lachesis','filter','confirm',{maxBursts:1,filter:true,burstWords:B.fates}),step('weave','weave',null,{maxBursts:1,burstWords:425}),step('lachesis','close','answer',{maxBursts:1,burstWords:B.fates})];
 }
 if(id==='horizon')return [step('ketill','ketill',null,{maxBursts:3,burstWords:B.horizon.ketill}),step('alvar','alvar',null,{maxBursts:3,burstWords:B.horizon.alvar}),step('sigrid','sigrid','answer',{maxBursts:1,burstWords:B.horizon.sigrid}),step('controller','map',null,{maxBursts:1,burstWords:425})];
 if(id==='refinery')return ({full:['builder','breaker','reforger'],build:['builder'],break:['breaker'],reforge:['reforger'],'build-break':['builder','breaker'],'break-reforge':['breaker','reforger']})[mode].map(s=>step(s,s,null,{burstWords:B.refinery}));
 if(id==='cartographers'){
  if(mode==='interrogation')return ['landscape','contradictions','citation-chain','gaps','methodology','master-synthesis','assumptions','knowledge-map','so-what'].map((s,i)=>step(i===0||i===4?'surveyor':i===1||i===2||i===6?'miner':'cartographer',s,null,s==='master-synthesis'?{maxBursts:1,burstWords:425}:{burstWords:B.cartographers}));
  return [...(mode==='direct'?[]:[step('surveyor',undefined,null,{burstWords:B.cartographers})]),step('miner',undefined,null,{burstWords:B.cartographers}),step('cartographer',undefined,null,{burstWords:B.cartographers})];
 }
 if(id==='mirror')return [...(mode==='deep'?[step('controller','framing','confirm',{maxBursts:1,burstWords:B.mirror})]:[]),step('retrospective',undefined,null,{burstWords:B.mirror}),step('prospective',undefined,null,{burstWords:B.mirror}),step('present','present','answer',{maxBursts:1,burstWords:B.mirror}),step('controller','synthesis',null,{maxBursts:1,burstWords:425})];
 if(id==='consilium')return [step('controller','framing','confirm',{maxBursts:1,burstWords:B.consilium}),step('principle','dialogue',null,{burstWords:B.consilium})];
 if(id==='witness')return [step('trace','trace','verify',{maxBursts:1,burstWords:B.witness.trace}),step('patterns',undefined,null,{burstWords:B.witness.patterns}),step('recalibration',undefined,null,{burstWords:B.witness.recalibration})];
 const clarify=thinTribunal(intake||{})?[step('controller','clarify',null,{maxBursts:2,burstWords:B.tribunal,clarify:true})]:[];
 return [...clarify,step('inverter',undefined,null,{burstWords:B.tribunal}),step('scaler',undefined,null,{burstWords:B.tribunal}),step('context-shifter',undefined,null,{burstWords:B.tribunal}),step('controller','convergence',null,{maxBursts:1,burstWords:425})];
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
export function publicSession(s){const keys=['id','protocolId','mode','intake','revision','status','stage','speaker','transcript','evidence','evidenceStatus','checkpoint','allowedActions','error','createdAt','updatedAt','summary','writeBack'];return Object.fromEntries(keys.map(k=>[k,copy(s[k])]).filter(([,v])=>v!==undefined));}
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
 if(revision!==current.revision)throw fault(409,'revision_conflict','Session changed. Refresh before continuing.');
 if(!current.allowedActions.includes(action))throw fault(409,'action_not_allowed','This action is not allowed at the current checkpoint.');
 if(text!==undefined&&(typeof text!=='string'||text.length>MAX_TEXT))throw fault(413,'input_limit','Response exceeds the text limit.');
 if(['answer','correct','reflect','reopen'].includes(action)&&!text?.trim())throw fault(400,'validation_error','A response is required.');
 const s=copy(current);s.revision++;s.error=null;
 if(action==='pause'){s.resumeStatus=s.status;s.status='paused';s.lease=null;return refresh(s);}
 if(action==='cancel'){s.status='cancelled';s.lease=null;return refresh(s);}
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
 if(action==='reflect'){s.status='completed';s.checkpoint=null;return refresh(s);}
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
function stopBudget(s,st,stage){
 if(st.stopWords){
  const used=s.transcript.filter(t=>t.role==='voice'&&t.stage===stage).reduce((n,t)=>n+words(t.text),0);
  const remaining=st.stopWords-used;
  return Math.max(1,Math.min(st.burstWords||90,remaining));
 }
 return st.burstWords||90;
}
export function buildPrompt(s,currentStep){
 const {speaker,stage,gate}=currentStep;
 const shared=loadKnowledgePrompt('cognitive/shared.md'),protocol=loadKnowledgePrompt(`cognitive/${s.protocolId}.md`);
 const isolated=s.protocolId==='tribunal'&&speaker!=='controller';
 const previous=isolated?[]:s.transcript;
 const maxBursts=currentStep.maxBursts??3,burst=(s.burst||0)+1,finalBurst=burst>=maxBursts;
 const budget=stopBudget(s,currentStep,stage);
 const knownContext=s.evidence.filter(e=>e.kind==='knowledge'||e.kind==='knowledge_hub_note'||e.kind==='central_node'||e.kind==='web'||String(e.kind||'').startsWith('web')||String(e.id||'').startsWith('web:'));
 const continuation=burst>1?`Continuation burst ${burst} of ${maxBursts}. The user answered your previous question. Continue from that answer. Do not repeat prior analysis.`:`Burst ${burst} of ${maxBursts}. Default length about ${budget} words.`;
 const closeRule=finalBurst&&!gate?'This is your final burst for this step. Close without asking a question.':'';
 const questionRule=gate?`This is a ${gate} checkpoint. Return one targeted question and STOP. Set done true.`:`One question per burst maximum. If you ask a question and will continue later, set done false. If this contribution is complete, set done true. ${closeRule}`;
 const midSearch=(s.protocolId==='cartographers'&&['surveyor','miner','cartographer'].includes(speaker))||(s.protocolId==='refinery'&&speaker==='builder');
 const instructions=[`Assigned speaker: ${speaker}. Assigned stage: ${stage}. Mode: ${s.mode}. Maximum ${budget} words including question.`,continuation,questionRule,'Speak in conversation. Never mention Knowledge Hub notes, retrieval, evidence status, self-report, or a missing archive. If knownContext is relevant, use it as something you already know.',s.protocolId==='fates'&&!COMPILE.has(stage)?'A prior confirmed plan supplies fixed creative/critical roles. At most 250 words across this stop.':'',s.protocolId==='fates'&&stage==='weave'&&s.filterCaution?`Hold with caution from the filter: ${s.filterCaution}`:'',s.protocolId==='consilium'&&stage==='dialogue'?`${s.dialogueCounts[speaker]?'Already spoke: no repeated signature opening.':'First contribution: use your signature opening.'} ${!s.answered[speaker]&&(s.dialogueCounts[speaker]||0)>=1?'User has not yet responded to you. Ask one meaningful decision/fact question now.':''}`:'',s.protocolId==='horizon'&&speaker==='ketill'?'You are Ketill only. Near horizon only: stop at two years, even if Adam named a longer one. Three to seven forks in consecutive sentences. Do not number them and do not say fork one. Miðgarðr speech, your own Old Norse words, one physical action, one of your names for Adam. You may ask one steering question per burst in character. No plan and no other voice\'s lines.':'',s.protocolId==='horizon'&&speaker==='alvar'?'You are Alvar only. Far horizon, work backwards, three to seven preconditions in consecutive sentences. Do not number them and do not say first, second or third. Your own Old Norse and mythic territory. You may answer Ketill. You may ask one steering question per burst in character. Do not write his or Sigrid\'s lines. Invent any memory. Do not copy one from the instructions.':'',s.protocolId==='horizon'&&speaker==='alvar'&&s.intake.desiredFuture?'A desired future was supplied. Work backwards from it. Do not use the extrapolation fallback.':'',s.protocolId==='horizon'&&speaker==='alvar'&&!s.intake.desiredFuture?'Fallback required: extrapolated from current trajectory, not from a stated goal. Moderate-to-low confidence ceiling.':'',s.protocolId==='horizon'&&speaker==='sigrid'?'You are Sigrid only. One turn of the iron ring. Cross-reference the findings already spoken. Each is a deliberate trade-off, unexamined drift, or unclassified. Ask that and stop. No reassurance and no other voice\'s lines.':'',s.protocolId==='horizon'&&speaker==='controller'?'You are the map compiler, not a fourth voice. Preserve each speaker\'s wording and every contradiction. No praise, plan, or recommendation.':'',s.protocolId==='mirror'&&speaker==='present'&&s.intake.timescale==='long-arc'?'Ask what the user is willing to sit with, tolerate or protect this week.':'',s.protocolId==='witness'&&speaker==='patterns'?`Trace verification: ${s.verification}. Sound thinking is the null hypothesis. Uncertain verification lowers confidence.`:'' ,s.protocolId==='tribunal'&&stage==='clarify'?'Ask up to two short steering questions that resolve thin or ambiguous intake. No reframe yet.':'',s.protocolId==='fates'&&stage==='filter'?'Name actual fallacies only. Set nextSpeaker to atropos for unsupported claims or clotho for narrowed options when a reopen may help. Ask whether to hold with caution, reopen, or close.' :'',midSearch?'You may use one web_search this burst for topic terms only. Never search personal details.':''].filter(Boolean).join('\n');
 const originalInput=isolated||s.protocolId==='tribunal'?{...s.intake}:s.intake;
 const lastReviewDate=s.lastReviewDate||s.intake?.lastReviewDate;
 const frequencyJustification=s.intake?.frequencyJustification;
 const cadence=s.protocolId==='horizon'&&(lastReviewDate||frequencyJustification)?{
  ...(lastReviewDate?{lastReviewDate}:{}),
  ...(frequencyJustification?{frequencyJustification}:{})
 }:null;
 return {speaker,stage,gate,wordBudget:budget,burst,maxBursts,tools:midSearch?[{type:'web_search_20250305',name:'web_search'}]:undefined,system:[shared,protocol,instructions].join('\n\n'),user:JSON.stringify({originalInput,mode:s.mode,...(cadence?{cadence}:{}),...(knownContext.length?{knownContext}:{}),...(!isolated?{conversation:previous,verification:s.verification??null}:{})})};
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
function parseVoice(raw){
 if(!raw||typeof raw!=='object'||typeof raw.text!=='string')return raw;
 const trimmed=raw.text.trim();
 const fenced=trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
 const candidate=fenced?.[1]?.trim()??trimmed;
 const start=candidate.indexOf('{'),end=candidate.lastIndexOf('}');
 if(start<0||end<=start)return raw;
 const slice=candidate.slice(start,end+1);
 let parsed;
 try{parsed=JSON.parse(slice);}
 catch{try{parsed=JSON.parse(repairJsonStrings(slice));}catch{return raw;}}
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
async function callVoice(model,s,p){
 let hint='',raw;
 for(let attempt=0;attempt<3;attempt++){
  const prompt=hint?{...p,system:`${p.system}\n${hint}`}:p;
  // Provider transport failures are not retried here; the service marks the stage failed for an explicit retry.
  raw=await model(prompt);
  try{return validateOutput(raw,s,p,{allowTrim:attempt>=2});}
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
  const p=buildPrompt(s,st);const result=await callVoice(model,s,p);
  let question=result.question;
  if(st.gate==='verify')question='Does this reconstruction match your experience of how the thinking unfolded? Is anything missing, inaccurate, or misrepresented?';
  if(st.gate&&!question)throw fault(502,'missing_question','The voice omitted its required checkpoint question. Retry this stage.');
  if(s.protocolId==='consilium'&&st.stage==='dialogue'){
   s.dialogueCounts[st.speaker]=(s.dialogueCounts[st.speaker]||0)+1;s.nextSpeaker=result.nextSpeaker;
   if(!question&&!s.answered[st.speaker]&&s.dialogueCounts[st.speaker]>=2)throw fault(502,'missing_question','This voice must invite a response before continuing.');
  }
  s.burst=(s.burst||0)+1;
  const maxBursts=st.maxBursts??3;
  const hardGate=st.gate&&st.gate!=='answer';
  // Final ungated burst must close without asking, even if the model ignored the prompt.
  if(s.burst>=maxBursts&&!st.gate)question=null;
  const done=result.done!==false||(!question&&!st.gate);
  const mayContinue=!hardGate&&question&&!done&&s.burst<maxBursts;
  let output=result.text;if(question&&!output.includes(question))output+=`\n\n${question}`;
  add(s,st.speaker==='controller'?'controller':'voice',st.speaker,st.stage,output,result.evidenceIds,{trimmed:result.trimmed||undefined,done,nextSpeaker:result.nextSpeaker});
  s.revision++;
  if(s.protocolId==='refinery'&&st.speaker==='breaker'&&result.thesisUnsound)add(s,'controller','controller','thesis-warning','The Breaker flagged the thesis as fundamentally unsound. Any reframe from the Reforger must be labelled as a suggestion distinct from the original.');
  if(s.protocolId==='witness'&&result.distress){s.status='paused';s.resumeStatus='waiting';s.checkpoint={kind:'answer',question:'The audit has landed hard. Would you prefer to stop or continue with softer framing?'};s.continueBurst=false;}
  else if(question){
   s.status='waiting';s.checkpoint={kind:st.gate||'answer',question};s.continueBurst=mayContinue;
   // Stay on the step for burst continuations and the filter (actions decide). Otherwise advance so the answer lands on the next step.
   if(!mayContinue&&!st.filter){s.cursor++;s.burst=0;}
  } else {
   s.cursor++;s.burst=0;s.continueBurst=false;
   if(s.protocolId==='consilium'&&st.stage==='dialogue')s.steps.push(nextDialogue(s,result.nextSpeaker));
  }
  if(s.cursor>=s.steps.length&&s.status==='running')s.status='completed';
  if(oneStage&&s.status==='running')s.status='queued';
  s=refresh(s);await onProgress(s);
  if(oneStage)break;
 }
 if(s.status==='running')s.status='completed';return refresh(s);
}
