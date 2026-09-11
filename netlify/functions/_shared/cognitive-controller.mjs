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
const step=(speaker,stage=speaker,gate=null,extra={})=>({speaker,stage,gate,...extra});
function plan(id,mode,intake){
 if(id==='fates'){
  const quota={sprint:2,normal:4,long:5}[mode],cycles=mode==='long'?3:mode==='normal'?2:1,stops=mode==='sprint'?3:6;
  const list=[step('lachesis','briefing','answer'),step('lachesis','briefing','answer'),step('lachesis','plan','confirm')];
  for(let c=0;c<cycles;c++){for(let t=0;t<stops;t++)for(let q=0;q<quota;q++)list.push(step(t%2?'atropos':'clotho',`cycle-${c+1}-${t+1}`,'answer',{micro:q,quota}));if(c<cycles-1)list.push(step('lachesis',`interrogation-${c+1}`,'answer'));}
  return [...list,step('lachesis','filter','confirm'),step('weave'),step('lachesis','close','answer')];
 }
 if(id==='horizon')return [step('ketill'),step('alvar'),step('sigrid','sigrid','answer'),step('controller','map')];
 if(id==='refinery')return ({full:['builder','breaker','reforger'],build:['builder'],break:['breaker'],reforge:['reforger'],'build-break':['builder','breaker'],'break-reforge':['breaker','reforger']})[mode].map(s=>step(s));
 if(id==='cartographers'){
  if(mode==='interrogation')return ['landscape','contradictions','citation-chain','gaps','methodology','master-synthesis','assumptions','knowledge-map','so-what'].map((s,i)=>step(i===0||i===4?'surveyor':i===1||i===2||i===6?'miner':'cartographer',s));
  return [...(mode==='direct'?[]:[step('surveyor')]),step('miner'),step('cartographer')];
 }
 if(id==='mirror')return [...(mode==='deep'?[step('controller','framing','confirm')]:[]),step('retrospective'),step('prospective'),step('present','present','answer'),step('controller','synthesis')];
 if(id==='consilium')return [step('controller','framing','confirm'),step('principle','dialogue')];
 if(id==='witness')return [step('trace','trace','verify'),step('patterns'),step('recalibration')];
 return [step('inverter'),step('scaler'),step('context-shifter'),step('controller','convergence')];
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
 const now=stamp();const s={id,owner,protocolId,mode,intake:data,revision:0,status:'queued',stage:'intake',speaker:null,transcript:[],evidence:[],evidenceStatus:'Evidence retrieval pending.',checkpoint:null,allowedActions:['pause','cancel'],error:null,createdAt:now,updatedAt:now,steps:plan(protocolId,mode,data),cursor:0,requests:{},dialogueCounts:{},answered:{},retrieved:false};
 return refresh(s);
}
function add(s,role,speaker,stage,text,evidenceIds=[]){if(s.transcript.length>=MAX_TURNS)throw fault(413,'session_limit','Session reached its 500-turn limit.');s.transcript.push({id:randomUUID(),role,speaker,stage,text,createdAt:stamp(),evidenceIds});}
export function canFinish(s){const min=s.mode==='extended'?2:1;return ['principle','consequence','virtue'].every(v=>(s.dialogueCounts[v]||0)>=min&&(s.answered[v]||0)>=1);}
function refresh(s){
 s.allowedActions=s.status==='waiting'?[...(s.checkpoint.kind==='verify'?['confirm','correct','uncertain']:s.checkpoint.kind==='reflection'?['reflect']:s.checkpoint.kind==='confirm'?['confirm','correct']:['answer','decline']),...(s.protocolId==='consilium'&&s.stage==='dialogue'&&canFinish(s)?['finish']:[]),'pause','cancel']:s.status==='paused'?['resume','cancel']:s.status==='failed'?['retry','cancel']:['queued','running'].includes(s.status)?['pause','cancel']:[];
 if(s.protocolId==='mirror'&&['waiting','completed'].includes(s.status)&&!s.allowedActions.includes('correct'))s.allowedActions.push('correct');
 s.updatedAt=stamp();if(Buffer.byteLength(JSON.stringify(s))>MAX_BYTES)throw fault(413,'session_limit','Session storage limit reached. Download this session and start a new one.');return s;
}
export function publicSession(s){const keys=['id','protocolId','mode','intake','revision','status','stage','speaker','transcript','evidence','evidenceStatus','checkpoint','allowedActions','error','createdAt','updatedAt'];return Object.fromEntries(keys.map(k=>[k,copy(s[k])]));}
function nextDialogue(s,candidate){
 const voices=['principle','consequence','virtue'],max=s.mode==='extended'?24:12,total=Object.values(s.dialogueCounts).reduce((a,b)=>a+b,0);
 if(total>=max&&canFinish(s))return step('controller','map','reflection');
 const min=Math.min(...voices.map(v=>s.dialogueCounts[v]||0));let next=voices.includes(candidate)?candidate:voices.find(v=>(s.dialogueCounts[v]||0)===min);
 if(!total&&next==='virtue')next='principle';
 if((s.dialogueCounts[next]||0)>min+1)next=voices.find(v=>(s.dialogueCounts[v]||0)===min);
 return step(next,'dialogue');
}
export function act(current,{action,text,revision,requestId}){
 if(!ID_RE.test(requestId||''))throw fault(400,'validation_error','Valid request ID required.');
 if(revision!==current.revision)throw fault(409,'revision_conflict','Session changed. Refresh before continuing.');
 if(!current.allowedActions.includes(action))throw fault(409,'action_not_allowed','This action is not allowed at the current checkpoint.');
 if(text!==undefined&&(typeof text!=='string'||text.length>MAX_TEXT))throw fault(413,'input_limit','Response exceeds the text limit.');
 if(['answer','correct','reflect'].includes(action)&&!text?.trim())throw fault(400,'validation_error','A response is required.');
 const s=copy(current);s.revision++;s.error=null;
 if(action==='pause'){s.resumeStatus=s.status;s.status='paused';s.lease=null;return refresh(s);}
 if(action==='cancel'){s.status='cancelled';s.lease=null;return refresh(s);}
 if(action==='resume'){s.status=s.resumeStatus==='waiting'?'waiting':'queued';return refresh(s);}
 if(action==='retry'){s.status='queued';s.lease=null;return refresh(s);}
 add(s,'user','you',s.stage,text?.trim()||({confirm:'Confirmed.',uncertain:'Uncertain; proceed with reduced confidence.',decline:'Explicitly declined.',finish:'Ready for the convergence and conflict map.'}[action]));
 if(action==='reflect'){s.status='completed';s.checkpoint=null;return refresh(s);}
 if(action==='correct'){
  if(s.protocolId==='witness'){s.cursor=0;s.verification=null;}
  else if(s.protocolId==='mirror'){s.intake.conflict=text.trim();s.steps=plan(s.protocolId,s.mode,s.intake);s.cursor=0;add(s,'controller','controller','correction','The prior reading is superseded. Restarting from the corrected conflict.');}
  else {s.cursor=Math.max(0,s.cursor-1);}
 } else if(s.protocolId==='witness'&&s.checkpoint?.kind==='verify')s.verification=action;
 if(s.protocolId==='consilium'&&s.stage==='dialogue'){
  s.answered[s.speaker]=(s.answered[s.speaker]||0)+1;
  s.steps.push(action==='finish'?step('controller','map','reflection'):nextDialogue(s,s.nextSpeaker));
 }
 s.checkpoint=null;s.status='queued';return refresh(s);
}
export function buildPrompt(s,currentStep){
 const {speaker,stage,gate}=currentStep;
 const shared=loadKnowledgePrompt('cognitive/shared.md'),protocol=loadKnowledgePrompt(`cognitive/${s.protocolId}.md`);
 const isolated=s.protocolId==='tribunal'&&speaker!=='controller';
 const previous=isolated?[]:s.transcript;
 const budget=s.protocolId==='fates'?Math.max(1,Math.floor((250-s.transcript.filter(t=>t.role==='voice'&&t.stage===stage).reduce((n,t)=>n+words(t.text),0))/((currentStep.quota||1)-(currentStep.micro||0)))):s.protocolId==='consilium'?100:s.protocolId==='tribunal'&&s.mode==='quick'?100:stage==='master-synthesis'?400:1500;
 const knownContext=s.evidence.filter(e=>e.kind==='knowledge'||e.kind==='knowledge_hub_note');
 const instructions=[`Assigned speaker: ${speaker}. Assigned stage: ${stage}. Mode: ${s.mode}. Maximum ${budget} words including question.`,gate?`This is a ${gate} checkpoint. Return one targeted question and STOP.`:'If a question is necessary, return it separately and STOP; do not continue analysis.','Speak in conversation. Never mention Knowledge Hub notes, retrieval, evidence status, self-report, or a missing archive. If knownContext is relevant, use it as something you already know.',s.protocolId==='fates'?`Micro-turn ${(currentStep.micro||0)+1} of ${currentStep.quota||1} in this logical stop. A prior confirmed plan supplies fixed creative/critical roles.`:'',s.protocolId==='consilium'&&stage==='dialogue'?`${s.dialogueCounts[speaker]?'Already spoke: no repeated signature opening.':'First contribution: use your signature opening.'} ${!s.answered[speaker]&&(s.dialogueCounts[speaker]||0)>=1?'User has not yet responded to you. Ask one meaningful decision/fact question now.':''}`:'',s.protocolId==='horizon'&&speaker==='alvar'&&!s.intake.desiredFuture?'Fallback required: extrapolated from current trajectory, not from a stated goal. Moderate-to-low confidence ceiling.':'',s.protocolId==='mirror'&&speaker==='present'&&s.intake.timescale==='long-arc'?'Ask what the user is willing to sit with, tolerate or protect this week.':'',s.protocolId==='witness'&&speaker==='patterns'?`Trace verification: ${s.verification}. Sound thinking is the null hypothesis. Uncertain verification lowers confidence.`:''].filter(Boolean).join('\n');
 return {speaker,stage,gate,wordBudget:budget,system:[shared,protocol,instructions].join('\n\n'),user:JSON.stringify({originalInput:s.intake,mode:s.mode,...(knownContext.length?{knownContext}:{}),...(!isolated?{conversation:previous,verification:s.verification??null}:{})})};
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
 return {...raw,...parsed,text:text||question,question:question??null,evidenceIds:Array.isArray(parsed.evidenceIds)?parsed.evidenceIds:(raw.evidenceIds??[])};
}
function validateOutput(raw,s,p){
 raw=parseVoice(raw);
 if(!raw||typeof raw.text!=='string'||!raw.text.trim())throw fault(502,'invalid_model_output','The voice returned no usable text. Retry this stage.');
 if(raw.question!=null&&typeof raw.question!=='string')throw fault(502,'invalid_model_output','The question format was invalid.');
 let text=raw.text.trim(),question=raw.question?.trim()||null;
 // A voice can use a question mark while reasoning. Only treat a final
 // interrogative sentence as a checkpoint request, and retain its analysis.
 if(!question&&(p.gate||p.stage==='dialogue')){const match=text.match(/(?:^|[\n.!])\s*([^\n.!?][^?\n.!]*\?)\s*$/u);if(match){question=match[1].trim();text=text.slice(0,match.index+(match[0].startsWith('\n')?1:0)).trim();}}
 const ids=raw.evidenceIds??[];if(!Array.isArray(ids)||ids.some(id=>!s.evidence.some(e=>e.id===id)))throw fault(502,'invalid_evidence','A voice referenced unavailable evidence.');
 if(/https?:\/\//i.test(text))throw fault(502,'invalid_evidence','A voice returned an unverified source link.');
 const quotes=raw.quotes??[];if(!Array.isArray(quotes))throw fault(502,'invalid_evidence','Invalid source quotation format.');
 for(const quote of quotes){const e=s.evidence.find(e=>e.id===quote.evidenceId);if(!e||typeof quote.text!=='string'||!quote.text||!e.text.includes(quote.text))throw fault(502,'invalid_evidence','A source quotation did not match the evidence.');if(!ids.includes(e.id))ids.push(e.id);text+=`\n\n> ${quote.text}\n[Source: ${e.id}]`;}
 if(words(text)+words(question&&!text.includes(question)?question:'')>p.wordBudget)throw fault(502,'voice_limit','The voice exceeded its word budget. Retry this stage.');
 if(s.protocolId==='consilium'&&p.stage==='dialogue'){
  const sentences=(text+(question&&!text.includes(question)?` ${question}`:'')).match(/[^.!?]+[.!?]+|[^.!?]+$/gu)||[];
  if(sentences.length>4)throw fault(502,'voice_limit','Consilium voices must stop within four sentences.');
 }
 return {...raw,text,question,evidenceIds:ids};
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
  const p=buildPrompt(s,st);const result=validateOutput(await model(p),s,p);
  let question=result.question;
  if(st.gate==='verify')question='Does this reconstruction match your experience of how the thinking unfolded? Is anything missing, inaccurate, or misrepresented?';
  if(st.gate&&!question)throw fault(502,'missing_question','The voice omitted its required checkpoint question. Retry this stage.');
  if(s.protocolId==='consilium'&&st.stage==='dialogue'){
   s.dialogueCounts[st.speaker]=(s.dialogueCounts[st.speaker]||0)+1;s.nextSpeaker=result.nextSpeaker;
   if(!question&&!s.answered[st.speaker]&&s.dialogueCounts[st.speaker]>=2)throw fault(502,'missing_question','This voice must invite a response before continuing.');
  }
  let output=result.text;if(question&&!output.includes(question))output+=`\n\n${question}`;
  add(s,st.speaker==='controller'?'controller':'voice',st.speaker,st.stage,output,result.evidenceIds);s.cursor++;s.revision++;
  if(s.protocolId==='refinery'&&st.speaker==='breaker'&&result.thesisUnsound)add(s,'controller','controller','thesis-warning','The Breaker flagged the thesis as fundamentally unsound. Any reframe from the Reforger must be labelled as a suggestion distinct from the original.');
  if(s.protocolId==='witness'&&result.distress){s.status='paused';s.resumeStatus='waiting';s.checkpoint={kind:'answer',question:'The audit has landed hard. Would you prefer to stop or continue with softer framing?'};}
  else if(question){s.status='waiting';s.checkpoint={kind:st.gate||'answer',question};}
  else if(s.protocolId==='consilium'&&st.stage==='dialogue')s.steps.push(nextDialogue(s,result.nextSpeaker));
  if(s.cursor>=s.steps.length&&s.status==='running')s.status='completed';
  if(oneStage&&s.status==='running')s.status='queued';
  s=refresh(s);await onProgress(s);
  if(oneStage)break;
 }
 if(s.status==='running')s.status='completed';return refresh(s);
}
