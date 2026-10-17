import { createAlchemyButton } from './block-button';
import { alchemyEditorActivity } from './passive-app';
import { apiGet, apiPost } from '@/api/client';
import { agentBySlug } from '@/ai/agents';
import { visitBlocks } from '@/blocks/walk-blocks';
import { renderBlock } from '@/blocks/render';
import { BlockSchema } from '@/schemas/block';
import { offerTimedUndo } from '../../design-kit/js/hub-feedback.js';
import { knowledgeHubPageUrl } from '@/alchemy/connections';
import { knowledgeHubOrigin } from '@/alchemy/client';
import { applyAlchemyProposal, blockRevision, canonical, contextSnapshot, type AlchemyEntity, type AlchemyProposal, type AlchemyResult } from './block-revision';
import { PassiveScheduler } from './passive-scheduler';
export {createAlchemyButton} from './block-button';

type Options={host:HTMLElement;kind:'lesson'|'unit';id:string;unit?:AlchemyEntity;getEntity:()=>AlchemyEntity;flush:()=>Promise<void>;apply:(next:AlchemyEntity)=>Promise<void>;request?:(body:unknown,signal:AbortSignal)=>Promise<AlchemyResult>;checkContext?:(proposal:AlchemyProposal)=>Promise<boolean>};
export function mountBlockAssistant(options:Options) {
  const {host}=options;host.dataset.alchemyAssistant='true';
  let disposed=false,activeAt=Date.now(),dialog:HTMLDialogElement|null=null,busy=false;
  const editorKey=options.kind+':'+options.id;alchemyEditorActivity(editorKey,true);
  let abort:AbortController|null=null;
  const lifecycle=new AbortController();
  let unitRevision=options.unit?canonical(contextSnapshot(options.unit)):'';
  const proposals=new Map<string,AlchemyProposal>(), localContexts=new Map<string,string>();
  const request=options.request??((body,signal)=>apiPost<AlchemyResult>('/api/alchemy-blocks',body,{signal}));
  const entityRevision=()=>canonical(contextSnapshot(options.getEntity()))+'|'+unitRevision;
  function paint(){
    host.querySelectorAll<HTMLElement>('.block[data-block-id]').forEach(block=>{
      if(!Array.from(block.children).some(child=>child.classList.contains('alchemy-block-button'))){
        const id=block.dataset.blockId!;let exists=false;visitBlocks(options.getEntity().blocks||[],b=>{if(b.id===id)exists=true;});
        if(exists)block.append(createAlchemyButton(id));
      }
    });
    host.querySelectorAll<HTMLButtonElement>('[data-alchemy-block]').forEach(button=>{
      const p=proposals.get(button.dataset.alchemyBlock!);
      const valid=Boolean(p&&localContexts.get(p.blockId)===entityRevision());
      const badge=button.querySelector<HTMLElement>('.alchemy-block-button__badge');if(badge)badge.hidden=!valid;
      button.classList.toggle('has-suggestion',valid);button.setAttribute('aria-label',valid?'Ann has a suggestion for this block. Open Alchemy Lab.':'Ask Ann about this block in Alchemy Lab');
    });
  }
  async function analyze(ids:string[],mode:'passive'|'manual',instruction='',previous?:AlchemyProposal):Promise<AlchemyResult>{
    if(busy)throw new Error('Ann is already checking a block. Try again shortly.');
    busy=true;abort=new AbortController();const currentAbort=abort;const timeout=setTimeout(()=>currentAbort.abort(),23000);
    try {
      await options.flush();if(disposed)throw new Error('Editor closed.');
      const original=entityRevision();
      const result=await request({kind:options.kind,id:options.id,blocks:ids,mode,instruction,previous:previous?{blockId:previous.blockId,content:previous.replacement.content,rationale:previous.rationale}:undefined},currentAbort.signal);
      if(disposed)throw new Error('Editor closed.');
      if(result.proposals.some(p=>!BlockSchema.safeParse(p.replacement).success))throw new Error('Ann returned an invalid suggestion.');
      if(original===entityRevision())for(const id of result.assessed){proposals.delete(id);localContexts.delete(id);}
      if(original===entityRevision())for(const p of result.proposals){proposals.set(p.blockId,p);localContexts.set(p.blockId,original);}
      paint();return result;
    }finally{clearTimeout(timeout);if(abort===currentAbort)abort=null;busy=false;}
  }
  // Due-soon scans may already have found a suggestion before this editor opened.
  try {
    const cached=JSON.parse(sessionStorage.getItem('alchemy-due:'+options.id)||'null') as {result:AlchemyResult}|null;
    if(cached?.result)for(const p of cached.result.proposals){
      let block:AlchemyProposal['replacement']|undefined;visitBlocks(options.getEntity().blocks||[],b=>{if(b.id===p.blockId)block=b;});
      if(block&&blockRevision(block)===p.original){proposals.set(p.blockId,p);localContexts.set(p.blockId,entityRevision());}
    }
  }catch{/* Cache is optional. */}
  const scheduler=new PassiveScheduler({
    snapshot:()=>{const result:Record<string,string>={};const entity=options.getEntity();const context=entityRevision();visitBlocks(entity.blocks||[],b=>{if(Object.keys(result).length<256)result[b.id]=blockRevision(b)+'|'+context.length+':'+smallFingerprint(context);});return result;},
    eligible:()=>!disposed&&!busy&&document.visibilityState==='visible'&&navigator.onLine&&Date.now()-activeAt<300000,
    run:async ids=>{await analyze(ids,'passive');}
  });
  function close(){if(dialog){dialog.remove();dialog=null;} }
  async function checkContext(p:AlchemyProposal):Promise<boolean>{
    if(options.checkContext)return options.checkContext(p);
    await options.flush();
    if(disposed)throw new Error('Editor closed.');
    const result=await apiPost<{valid:boolean}>('/api/alchemy-blocks',{kind:options.kind,id:options.id,blocks:[p.blockId],mode:'manual',validateOnly:true,contextRevision:p.contextRevision,sourceIds:p.sources.map(s=>s.id)},{signal:AbortSignal.any([lifecycle.signal,AbortSignal.timeout(23000)])});
    return result.valid;
  }
  async function open(blockId:string){
    if(disposed)return;close();activeAt=Date.now();
    const ann=agentBySlug('ann')!;const review=document.createElement('dialog');dialog=review;review.className='alchemy-review glass-panel';review.setAttribute('aria-label','Alchemy Lab with '+ann.name);
    const heading=document.createElement('h2');heading.textContent='Alchemy Lab · '+ann.name;
    const body=document.createElement('div');body.className='alchemy-review__body';body.setAttribute('aria-live','polite');
    const actions=document.createElement('div');actions.className='alchemy-review__actions';
    const accept=document.createElement('button');accept.type='button';accept.className='btn btn--primary alchemy-review__accept';accept.textContent='Apply suggestion';accept.hidden=true;
    const discard=document.createElement('button');discard.type='button';discard.className='btn btn--ghost';discard.textContent='Discard';
    const hide=document.createElement('button');hide.type='button';hide.className='btn btn--ghost';hide.textContent='Close';
    const form=document.createElement('form');form.className='alchemy-review__composer';
    const input=document.createElement('textarea');input.placeholder='Keep this, change this, leave this part out…';input.setAttribute('aria-label','Discuss this block with Ann');input.maxLength=2000;
    const send=document.createElement('button');send.type='submit';send.className='btn btn--primary';send.textContent='Ask Ann';form.append(input,send);
    const error=document.createElement('p');error.className='alchemy-review__error';error.setAttribute('role','alert');
    actions.append(accept,discard,hide);review.append(heading,body,error,form,actions);document.body.append(review);if(review.showModal)review.showModal();else review.setAttribute('open','');
    let current:AlchemyProposal|undefined;let working=false;const startContext=entityRevision();const conversation:Array<{role:string;text:string}>=[];
    function setWorking(value:boolean){working=value;send.disabled=value;accept.disabled=value;}
    function paintProposal(){
      body.replaceChildren();for(const turn of conversation){const text=document.createElement('p');text.textContent=(turn.role==='user'?'You: ':'Ann: ')+turn.text;body.append(text);}
      accept.hidden=!current;
      if(!current){const empty=document.createElement('p');empty.textContent='Ann has no change to suggest for this block. Tell her what you want below.';body.append(empty);return;}
      const rationale=document.createElement('p');rationale.className='alchemy-review__rationale';rationale.textContent=current.rationale;body.append(rationale);
      const preview=document.createElement('div');preview.className='alchemy-review__preview';preview.append(renderBlock(current.replacement,'student'));body.append(preview);
      for(const source of current.sources){const link=document.createElement('a');link.href=knowledgeHubPageUrl(knowledgeHubOrigin(),source.id);link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.title;body.append(link);const excerpt=document.createElement('p');excerpt.textContent=source.excerpt;body.append(excerpt);}
    }
    async function ask(instruction=''){
      setWorking(true);error.textContent='';if(!current)body.textContent='Ann is checking the block and its context…';
      try {if(entityRevision()!==startContext)throw new Error('The lesson or unit changed. Close this review and ask Ann again.');
        const previous=current;const result=await analyze([blockId],'manual',conversation.map(t=>t.role+': '+t.text).join('\n').slice(-1800)||instruction,previous);
        if(dialog!==review)return;current=result.proposals.find(p=>p.blockId===blockId);paintProposal();scheduler.suppress([blockId]);
      }catch(e){error.textContent=e instanceof Error?e.message:'Ann could not finish this check.';}finally{setWorking(false);}
    }
    form.addEventListener('submit',event=>{event.preventDefault();if(working||!input.value.trim())return;conversation.push({role:'user',text:input.value.trim()});input.value='';void ask();});
    accept.addEventListener('click',()=>{if(!current||working)return;void(async()=>{
      setWorking(true);try {
        if(entityRevision()!==startContext || !(await checkContext(current!)))throw new Error('The lesson or unit changed. Ask Ann again before applying.');
        if(disposed||dialog!==review)return;
        if(entityRevision()!==startContext)throw new Error('The lesson or unit changed. Ask Ann again before applying.');
        const before=structuredClone(options.getEntity());const next=applyAlchemyProposal(before,current!);await options.apply(next);
        const accepted=current!;const afterRevision=blockRevision(accepted.replacement);proposals.delete(blockId);scheduler.suppress([blockId]);paint();close();
        offerTimedUndo({message:'Ann’s suggestion applied.',onUndo:()=>{if(disposed)return;const entity=options.getEntity();const inverse={...accepted,original:afterRevision,replacement:findOriginal(before,blockId)};try{void options.apply(applyAlchemyProposal(entity,inverse)).catch(()=>{});}catch{/* Newer teacher work takes precedence. */}}});
      }catch(e){error.textContent=e instanceof Error?e.message:'The change could not be saved.';}finally{setWorking(false);}
    })();});
    discard.addEventListener('click',()=>{proposals.delete(blockId);scheduler.suppress([blockId]);paint();close();});hide.addEventListener('click',close);review.addEventListener('cancel',close);
    current=proposals.get(blockId);
    if(current&&localContexts.get(blockId)===startContext){
      setWorking(true);body.textContent='Ann is checking the suggestion is still current…';
      try{if(await checkContext(current))paintProposal();else{current=undefined;await ask();}}catch(e){error.textContent=e instanceof Error?e.message:'This suggestion could not be checked.';}finally{setWorking(false);}
    }else{current=undefined;void ask();}
  }
  function onOpen(event:Event){const id=(event as CustomEvent<{blockId:string}>).detail.blockId;void open(id);}
  const active=()=>{activeAt=Date.now();alchemyEditorActivity(editorKey,true);scheduler.changed();};
  host.addEventListener('alchemy-open',onOpen);host.addEventListener('input',active);host.addEventListener('pointerdown',active);host.addEventListener('keydown',active);
  const observer=new MutationObserver(paint);observer.observe(host,{childList:true,subtree:true});paint();scheduler.changed();
  const unitTimer=setInterval(()=>{
    const unitId=options.kind==='lesson'?options.getEntity().unit_id:null;
    if(!unitId||disposed||document.visibilityState!=='visible'||Date.now()-activeAt>=300000||!navigator.onLine)return;
    void apiGet<AlchemyEntity>('/api/units/'+unitId,{signal:AbortSignal.any([lifecycle.signal,AbortSignal.timeout(8000)])}).then(unit=>{
      if(disposed)return;const next=canonical(contextSnapshot(unit));if(next!==unitRevision){unitRevision=next;paint();scheduler.changed();}
    }).catch(()=>{});
  },180000);
  return {open,changed(){active();paint();},dispose(){disposed=true;lifecycle.abort();clearInterval(unitTimer);alchemyEditorActivity(editorKey,false);abort?.abort();scheduler.dispose();observer.disconnect();close();host.removeEventListener('alchemy-open',onOpen);host.removeEventListener('input',active);host.removeEventListener('pointerdown',active);host.removeEventListener('keydown',active);delete host.dataset.alchemyAssistant;}};
}
function smallFingerprint(text:string):string {let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return String(hash>>>0);}
function findOriginal(entity:AlchemyEntity,id:string){let found:AlchemyProposal['replacement']|undefined;visitBlocks(entity.blocks||[],b=>{if(b.id===id)found=b;});if(!found)throw new Error('Block removed');return found;}
