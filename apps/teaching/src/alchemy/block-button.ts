import { agentBySlug } from '@/ai/agents';
export function createAlchemyButton(blockId:string):HTMLButtonElement {
  const ann=agentBySlug('ann')!;
  const button=document.createElement('button');button.type='button';button.className='alchemy-block-button';button.dataset.alchemyBlock=blockId;
  button.setAttribute('aria-label','Ask Ann about this block in Alchemy Lab');button.title='Alchemy Lab';button.style.setProperty('--alchemy-accent',ann.colour);
  const face=document.createElement('img');face.src=ann.avatarSrc;face.alt='';face.width=30;face.height=30;
  const beaker=document.createElement('span');beaker.className='alchemy-block-button__beaker';beaker.setAttribute('aria-hidden','true');
  beaker.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 3h8M10 3v7L5 19q-1 2 2 2h10q3 0 2-2l-5-9V3M8 15h8"/></svg>';
  const badge=document.createElement('span');badge.className='alchemy-block-button__badge';badge.textContent='1';badge.hidden=true;
  button.append(face,beaker,badge);
  button.addEventListener('click',event=>{event.stopPropagation();button.dispatchEvent(new CustomEvent('alchemy-open',{bubbles:true,detail:{blockId}}));});
  return button;
}
