import { createGitHubClient } from './github-client.mjs';
import {
  extractAboutMe,
  extractThisMonth,
  extractLongTermTrends,
  extractConstraints,
  extractCrossAgentCoordination,
  extractRecentAgentActions
} from '../../../apps/life/js/core/constraints.js';

/** Per-protocol Central Node section selection. Reviewable in code, not buried in prompts. */
export const PROTOCOL_CENTRAL_NODE_SECTIONS = {
  fates: [{ id: 'about_me' }, { id: 'this_month' }],
  horizon: [
    { id: 'about_me' },
    { id: 'this_month' },
    { id: 'long_term_trends' },
    { id: 'constraints', subsections: ['Work', 'Time'] },
    { id: 'cross_agent' }
  ],
  refinery: [{ id: 'about_me', subsections: ['Work', 'Study'] }],
  cartographers: [{ id: 'about_me', subsections: ['Work', 'Study'] }],
  mirror: [
    { id: 'about_me' },
    { id: 'long_term_trends' },
    { id: 'recent_actions' },
    { id: 'medical_status', summaryOnly: true }
  ],
  witness: [
    { id: 'about_me' },
    { id: 'long_term_trends' },
    { id: 'recent_actions' },
    { id: 'medical_status', summaryOnly: true }
  ],
  consilium: [
    { id: 'about_me' },
    { id: 'people' },
    { id: 'this_month' }
  ],
  tribunal: [{ id: 'about_me' }, { id: 'this_month' }]
};

const SECTION_READERS = {
  about_me: extractAboutMe,
  this_month: extractThisMonth,
  long_term_trends: extractLongTermTrends,
  constraints: extractConstraints,
  cross_agent: extractCrossAgentCoordination,
  recent_actions: extractRecentAgentActions
};

// Spec note: web research uses topic terms only. Personal narrative fields
// (dilemma, conflict, entrenchment, framing, problem, audience) stay out of search queries.
// Mirror, Witness and Consilium skip the web step entirely: their intake is personal by nature.
const TOPIC_KEYS = new Set(['task', 'topic', 'claim', 'focus', 'purpose']);
const NO_WEB_PROTOCOLS = new Set(['mirror', 'witness', 'consilium']);
const RESEARCH_TIMEOUT_MS = 15_000;
const STOP = new Set(['about','after','again','also','and','any','are','because','been','before','being','between','but','can','could','for','from','has','have','here','how','into','its','just','like','may','might','more','most','need','not','only','other','our','out','over','really','same','should','some','stay','such','than','that','the','their','them','then','there','they','this','through','too','under','very','want','was','were','what','when','where','whether','which','while','who','why','will','with','would','you','your']);

function extractSubsection(body, name) {
  if (!body) return '';
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`^###\\s*${escaped}\\b.*$`,'mi').exec(body);
  if (!match) return '';
  const rest=body.slice(match.index+match[0].length);
  const end=rest.search(/\n### |\n## /);
  return (end===-1?rest:rest.slice(0,end)).trim();
}

function extractNamedBlock(markdown, name) {
  if (!markdown) return '';
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`^#{2,3}\\s*[^\\n]*${escaped}[^\\n]*$`,'mi').exec(markdown);
  if (!match) return '';
  const rest=markdown.slice(match.index+match[0].length);
  const end=rest.search(/\n## /);
  return (end===-1?rest:rest.slice(0,end)).trim();
}

function summariseMedical(text) {
  if (!text) return '';
  const lines=text.split('\n').map(l=>l.trim()).filter(Boolean).slice(0,6);
  return lines.join('\n').slice(0,500);
}

/** Topic terms only: never Central Node text and never personal intake fields. */
export function topicSearchTerms(session) {
  const intake=session?.intake||{};
  const blob=Object.entries(intake)
    .filter(([key])=>TOPIC_KEYS.has(key))
    .map(([,value])=>value)
    .join(' ')
    .toLowerCase();
  return blob.match(/[a-z0-9]{4,}/g)
    ?.filter((term,index,all)=>!STOP.has(term)&&all.indexOf(term)===index)
    .slice(0,12)??[];
}

function stripMedical(text) {
  if (!text) return '';
  return text
    .split(/\n(?=### )/)
    .filter(block => !/^###\s*Medical\b/i.test(block.trim()))
    .join('\n')
    .replace(/^#{2,3}\s*[^\n]*Medical Status[^\n]*\n[\s\S]*?(?=\n## |\n### |$)/gim, '')
    .trim();
}

const STRIP_MEDICAL_SECTIONS = new Set(['about_me','this_month','long_term_trends','constraints','recent_actions','cross_agent']);

export function selectCentralNodeEvidence(markdown, protocolId) {
  const specs=PROTOCOL_CENTRAL_NODE_SECTIONS[protocolId]||[];
  const allowMedical=specs.some(s=>s.id==='medical_status');
  const evidence=[];
  for(const spec of specs){
    let text='';
    if(spec.id==='medical_status'){
      text=summariseMedical(extractNamedBlock(markdown,'Medical Status')||extractSubsection(extractAboutMe(markdown),'Medical'));
    } else if(spec.id==='people'){
      text=extractSubsection(extractAboutMe(markdown),'People')||extractNamedBlock(markdown,'People');
    } else {
      const reader=SECTION_READERS[spec.id];
      const whole=reader?reader(markdown):'';
      if(spec.subsections?.length){
        text=spec.subsections.map(name=>extractSubsection(whole,name)).filter(Boolean).join('\n\n');
      } else text=whole;
      if(!allowMedical&&STRIP_MEDICAL_SECTIONS.has(spec.id))text=stripMedical(text);
    }
    if(!text.trim())continue;
    evidence.push({
      id:`central_node:${spec.id}${spec.subsections?':'+spec.subsections.join('+').toLowerCase():''}`,
      kind:'central_node',
      title:`Central Node · ${spec.id}`,
      text:text.slice(0,4000),
      source:'Central Node'
    });
  }
  return evidence;
}

export async function readCentralNodeMarkdown(env, fetchImpl=fetch) {
  const client=createGitHubClient({env,fetchImpl});
  const {tree}=await client.resolveTree();
  const entry=tree.find(e=>e.path==='central-node.md'&&e.type==='blob');
  if(!entry?.sha)return null;
  return client.readBlob(entry.sha);
}

function isAbsoluteHttps(url) {
  if(typeof url!=='string'||!url.trim())return false;
  try {
    const parsed=new URL(url.trim());
    return parsed.protocol==='https:';
  } catch {
    return false;
  }
}

export function parseResearchFindings(text) {
  const findings=[];
  try {
    const start=text.indexOf('{'),end=text.lastIndexOf('}');
    if(start>=0&&end>start){
      const parsed=JSON.parse(text.slice(start,end+1));
      const list=Array.isArray(parsed.findings)?parsed.findings:Array.isArray(parsed)?parsed:[];
      for(const item of list){
        if(findings.length>=5)break;
        if(!item||typeof item!=='object')continue;
        const title=typeof item.title==='string'?item.title.trim():'';
        const url=typeof item.url==='string'?item.url.trim():'';
        const excerpt=typeof item.excerpt==='string'?item.excerpt.trim():(typeof item.summary==='string'?item.summary.trim():'');
        if(!isAbsoluteHttps(url))continue;
        if(title||excerpt)findings.push({title:title||'Finding',url,excerpt:excerpt.slice(0,500)});
      }
    }
  } catch {
    return [];
  }
  return findings;
}

function withTimeout(promise, ms, label='timeout') {
  let timer;
  return Promise.race([
    promise.finally(()=>{if(timer)clearTimeout(timer);}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(label),{code:'timeout'})),ms);})
  ]);
}

export async function researchBrief(session, {model, terms}={}) {
  if(NO_WEB_PROTOCOLS.has(session?.protocolId))return {evidence:[],unavailable:false};
  const queryTerms=(terms||topicSearchTerms(session)).slice(0,8);
  if(!queryTerms.length||typeof model!=='function')return {evidence:[],unavailable:false};
  const system=[
    'Produce a short research brief as JSON: {"findings":[{"title","url","excerpt"}]}.',
    'Use the web_search tool if available. Three to five findings maximum.',
    'Search using only the supplied topic terms. Never search for personal names, medical details, addresses, or private life facts.'
  ].join(' ');
  const user=JSON.stringify({topicTerms:queryTerms,task:'research brief for a thinking protocol'});
  const raw=await model({
    system,
    user,
    wordBudget:300,
    maxTokens:4096,
    tools:[{type:'web_search_20250305',name:'web_search'}],
    speaker:'research',
    stage:'research-brief'
  });
  const text=typeof raw?.text==='string'?raw.text:'';
  const findings=parseResearchFindings(text);
  return {
    evidence:findings.map((f,i)=>({
      id:`web:${i+1}`,
      kind:'web',
      title:f.title,
      text:f.excerpt,
      url:f.url,
      source:'Web research'
    })),
    unavailable:false
  };
}

/**
 * Shared context gatherer for both the background runner and the inline path.
 * Best-effort: failed sources are named in status and never block the session.
 */
export async function gatherContext(session, env, {
  fetchImpl=fetch,
  retrieveKnowledge,
  model,
  readCentralNode=readCentralNodeMarkdown,
  research=researchBrief
}={}) {
  const evidence=[];
  const unavailable=[];

  const cnTask=async()=>{
    const markdown=await readCentralNode(env,fetchImpl);
    if(markdown)return selectCentralNodeEvidence(markdown,session.protocolId);
    unavailable.push('central_node');
    return [];
  };
  const khTask=async()=>{
    if(typeof retrieveKnowledge!=='function')return [];
    const kh=await retrieveKnowledge(session,env,fetchImpl);
    return Array.isArray(kh?.evidence)?kh.evidence:[];
  };
  const webTask=async()=>{
    if(NO_WEB_PROTOCOLS.has(session?.protocolId))return [];
    const web=await withTimeout(
      research(session,{model,terms:topicSearchTerms(session)}),
      RESEARCH_TIMEOUT_MS,
      'research timeout'
    );
    if(web?.unavailable)unavailable.push('web');
    return Array.isArray(web?.evidence)?web.evidence:[];
  };

  const settled=await Promise.allSettled([cnTask(),khTask(),webTask()]);
  const labels=['central_node','knowledge_hub','web'];
  settled.forEach((result,i)=>{
    if(result.status==='fulfilled')evidence.push(...result.value);
    else if(!unavailable.includes(labels[i]))unavailable.push(labels[i]);
  });

  const status=unavailable.length
    ? `Context partially available. Unavailable: ${unavailable.join(', ')}.`
    : evidence.some(e=>e.kind==='central_node'||e.kind==='knowledge_hub_note'||e.kind==='web')
      ? 'Context gathered from available sources.'
      : 'No matching context sources returned results.';
  return {evidence,status,unavailable};
}
