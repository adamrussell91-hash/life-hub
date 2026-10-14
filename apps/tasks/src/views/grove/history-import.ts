import {validateGroveHistory,GROVE_HISTORY_MAX_BYTES,type GroveHistory} from '../../../../../packages/grove-history/validate.mjs';
/** One atomic preferences patch. Selecting a file is the user's save action. */
export function createGroveHistoryImport(save:(patch:{grove_history:GroveHistory})=>Promise<unknown>,onSaved:()=>void,active:()=>boolean=()=>true):HTMLElement {
 const wrap=document.createElement('div');wrap.className='grove-history-control';
 const button=document.createElement('button');button.type='button';button.className='btn btn--secondary grove-history-import';button.textContent='Import history';
 const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.className='grove-history-file';file.hidden=true;file.setAttribute('aria-label','Grove history file');
 const status=document.createElement('span');status.className='grove-history-status';status.setAttribute('role','status');
 button.addEventListener('click',()=>file.click());
 file.addEventListener('change',async()=>{const selected=file.files?.[0];if(!selected||button.disabled)return;button.disabled=true;status.textContent='Saving history…';try{if(selected.size>GROVE_HISTORY_MAX_BYTES)throw new Error('History file is too large.');const history=validateGroveHistory(JSON.parse(await selected.text()));if(!active())return;await save({grove_history:history});if(active()){status.textContent='History saved.';onSaved();}}catch{if(active())status.textContent='Invalid history or unable to save. Choose a valid file and try again.';}finally{button.disabled=false;file.value='';}});
 wrap.append(button,file,status);return wrap;
}
