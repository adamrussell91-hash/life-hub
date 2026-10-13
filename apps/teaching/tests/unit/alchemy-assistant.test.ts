import {describe,it,expect,vi} from 'vitest';
import {createBlock} from '@/blocks/create-block';
const impl=await import('@/alchemy/block-assistant').catch(()=>({} as Record<string,any>));
const rev=await import('@/alchemy/block-revision').catch(()=>({} as Record<string,any>));
describe('Alchemy block review',()=>{
 it('targets nested blocks, rejects stale changes, and preserves sibling media',()=>{
  expect(typeof rev.applyAlchemyProposal).toBe('function');const section=createBlock('section','s');const heading=createBlock('heading','h');const video=createBlock('video','v');section.content.blocks=[heading,video];
  const entity={title:'Lesson',blocks:[section]};const p={blockId:'h',original:rev.blockRevision(heading),replacement:{...heading,content:{text:'Model then try',variant:'h2'}}};
  const next=rev.applyAlchemyProposal(entity,p);expect(next.blocks[0].content.blocks[0].content.text).toBe('Model then try');expect(next.blocks[0].content.blocks[1]).toEqual(video);
  heading.content.text='Teacher changed it';expect(()=>rev.applyAlchemyProposal(entity,p)).toThrow(/changed/);
 });
 it('rejects changed media references',()=>{
  expect(typeof rev.applyAlchemyProposal).toBe('function');const b=createBlock('video','v');const entity={title:'Lesson',blocks:[b]};const p={blockId:'v',original:rev.blockRevision(b),replacement:{...b,content:{...b.content,external_id:'different'}}};expect(()=>rev.applyAlchemyProposal(entity,p)).toThrow();
 });
 it('opens an accessible review and applies accepted content',async()=>{
  expect(typeof impl.mountBlockAssistant).toBe('function');const b=createBlock('heading','h');let entity={title:'Lesson',blocks:[b]};const host=document.createElement('div');document.body.append(host);
  const result={contextRevision:'ctx',assessed:['h'],proposals:[{blockId:'h',original:rev.blockRevision(b),contextRevision:'ctx',rationale:'Show a model first.',replacement:{...b,content:{text:'Watch then try',variant:'h2'}},sources:[{id:'p',title:'Scaffolding',excerpt:'A model helps.'}]}]};
  const handle=impl.mountBlockAssistant({host,kind:'lesson',id:'l',getEntity:()=>entity,flush:async()=>{},apply:async(next:any)=>{entity=next;},request:async()=>result,checkContext:async()=>true});
  const button=impl.createAlchemyButton('h');host.append(button);expect(button.getAttribute('aria-label')).toContain('Ann');button.click();await vi.waitFor(()=>expect(document.querySelector('.alchemy-review__rationale')?.textContent).toContain('model'));
  (document.querySelector('.alchemy-review__accept') as HTMLButtonElement).click();await vi.waitFor(()=>expect(entity.blocks[0].content.text).toBe('Watch then try'));handle.dispose();host.remove();
 });
});
it('layout movement does not invalidate teaching context but outcome changes do',()=>{
 const a=createBlock('heading','a'),b=createBlock('heading','b');const first={title:'Lesson',blocks:[a,b],outcome_ids:['o1']};const moved={...first,blocks:[b,a]};expect(rev.canonical(rev.contextSnapshot(first))).toBe(rev.canonical(rev.contextSnapshot(moved)));expect(rev.canonical(rev.contextSnapshot(first))).not.toBe(rev.canonical(rev.contextSnapshot({...first,outcome_ids:['o2']})));
});
it('protects whiteboard storage references',()=>{
 const b=createBlock('whiteboard','w');b.content.document_id='board-original';
 expect(()=>rev.applyAlchemyProposal({title:'Lesson',blocks:[b]},{blockId:'w',original:rev.blockRevision(b),replacement:{...b,content:{...b.content,document_id:'board-other'}}})).toThrow();
});
it('closing the editor during acceptance prevents the pending edit',async()=>{
 const b=createBlock('heading','h');const entity={title:'Lesson',blocks:[b]};const host=document.createElement('div');document.body.append(host);
 let resolveCheck:(value:boolean)=>void=()=>{};let applied=false;
 const result={contextRevision:'ctx',assessed:['h'],proposals:[{blockId:'h',original:rev.blockRevision(b),contextRevision:'ctx',rationale:'Model first',replacement:{...b,content:{text:'Changed'}},sources:[{id:'p',title:'Source',excerpt:'Evidence'}]}]};
 const assistant=impl.mountBlockAssistant({host,kind:'lesson',id:'l',getEntity:()=>entity,flush:async()=>{},apply:async()=>{applied=true;},request:async()=>result,checkContext:()=>new Promise<boolean>(resolve=>resolveCheck=resolve)});
 void assistant.open('h');await vi.waitFor(()=>expect(document.querySelector('.alchemy-review__accept')?.hasAttribute('hidden')).toBe(false));
 (document.querySelector('.alchemy-review__accept') as HTMLButtonElement).click();assistant.dispose();resolveCheck(true);await new Promise(r=>setTimeout(r,20));expect(applied).toBe(false);host.remove();
});
it('a changed sibling requalifies the contextual passive assessment',async()=>{
 vi.useFakeTimers();const a=createBlock('heading','a'),b=createBlock('heading','b');const entity={title:'Lesson',blocks:[a,b]};const host=document.createElement('div');document.body.append(host);let calls=0;const batches:string[][]=[];
 const assistant=impl.mountBlockAssistant({host,kind:'lesson',id:'l',getEntity:()=>entity,flush:async()=>{},apply:async()=>{},request:async(body:any)=>{calls++;batches.push(body.blocks);return {proposals:[],assessed:body.blocks,contextRevision:'ctx',mode:'empty'};}});
 await vi.advanceTimersByTimeAsync(30000);expect(calls).toBe(1);b.content.text='A different learning activity';assistant.changed();await vi.advanceTimersByTimeAsync(180000);expect(calls).toBe(2);expect(batches[1]).toContain('a');assistant.dispose();host.remove();vi.useRealTimers();
});
