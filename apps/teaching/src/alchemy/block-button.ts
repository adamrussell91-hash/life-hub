import { agentBySlug } from '@/ai/agents';
/** A quiet beaker beside the block's ⋯ menu: one per top-level block, faint until the block is in use. */
export function createAlchemyButton(blockId:string):HTMLButtonElement {
  const ann=agentBySlug('ann')!;
  const button=document.createElement('button');button.type='button';button.className='alchemy-block-button';button.dataset.alchemyBlock=blockId;
  button.setAttribute('aria-label','Ask Ann about this block in Alchemy Lab');button.title='Alchemy Lab · Ask Ann';button.style.setProperty('--alchemy-accent',ann.colour);
  button.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8M10 3v7L5 19q-1 2 2 2h10q3 0 2-2l-5-9V3M8 15h8"/></svg>';
  button.addEventListener('click',event=>{event.stopPropagation();button.dispatchEvent(new CustomEvent('alchemy-open',{bubbles:true,detail:{blockId}}));});
  return button;
}
