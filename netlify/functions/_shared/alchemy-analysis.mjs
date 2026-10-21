import { alchemyError, ALCHEMY_INPUT_CAP, ALCHEMY_OUTPUT_CAP } from './alchemy-budget.mjs';

export async function boundedJson(response, maxBytes = 1000000) {
  if (Number(response.headers.get('content-length')) > maxBytes) throw alchemyError(502,'alchemy_payload','Alchemy response was too large.');
  const reader=response.body?.getReader(); if (!reader) return null;
  const chunks=[]; let size=0;
  try { while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>maxBytes)throw alchemyError(502,'alchemy_payload','Alchemy response was too large.'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(()=>{}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Teacher-visible words in a block, without IDs, URLs or field names, for Knowledge Hub search. */
export function alchemyQueryText(blocks) {
  const parts=[];
  const walk=(value,key='')=>{
    if(typeof value==='string'){if(!/(^|_)(id|ids|url|src|href|key)$/i.test(key)&&!/^https?:/i.test(value))parts.push(value.replace(/<[^>]*>/g,' '));return;}
    if(Array.isArray(value)){for(const item of value)walk(item,key);return;}
    if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))walk(v,k);
  };
  for(const block of blocks)walk(block.content);
  return parts.join(' ').replace(/\s+/g,' ').trim().slice(0,2000);
}

/** Byte cap on one prompt: a conservative token upper bound the budget reserves against. */
export { ALCHEMY_INPUT_CAP };

export async function completeAlchemy({prompt,env,fetchImpl,signal}) {
  const response=await fetchImpl('https://api.anthropic.com/v1/messages',{method:'POST',signal,headers:{'content-type':'application/json','x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:env.ALCHEMY_PASSIVE_MODEL,max_tokens:ALCHEMY_OUTPUT_CAP,system:prompt.system,messages:[{role:'user',content:prompt.user}]})});
  if (!response.ok) {
    const retry=response.headers.get('retry-after');
    const wait=Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now());
    throw alchemyError(response.status,'alchemy_upstream',response.status===429?'Ann is pausing because the AI service is busy.':'Alchemy Lab could not complete this check.',wait||0);
  }
  const payload=await boundedJson(response,128000);
  if(payload?.stop_reason==='max_tokens')throw alchemyError(502,'alchemy_invalid','Ann’s rewrite was cut off before she finished. Try a shorter block.');
  const content=payload.content?.find(c=>c.type==='text')?.text;
  const json=String(content??'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  let result; try {result=JSON.parse(json);}catch {throw alchemyError(502,'alchemy_invalid','Ann returned an invalid suggestion. Try again later.');}
  return {...result,usage:{input:payload.usage?.input_tokens,output:payload.usage?.output_tokens}};
}

/** Notes Ann says are worth keeping for the unit; only ids that were supplied to her count. */
export function parseUnitNotes(raw,sources) {
  if(!Array.isArray(raw?.unitNotes))return [];
  return raw.unitNotes.slice(0,12).flatMap(n=>{const source=sources.find(s=>s.id===n?.id);return source?[{id:source.id,title:source.title,excerpt:source.excerpt,why:typeof n.why==='string'?n.why:''}]:[];});
}
