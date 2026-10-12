import { randomUUID } from 'node:crypto';

const conflict = message => { throw Object.assign(new Error(message),{status:409,code:'schedule_busy'}); };

/** Conditional writes guard class/lesson ownership across separate Function instances. */
export async function withTimetableLocks(store, keys, run) {
  const owner=randomUUID(), held=[];
  try {
    for(const key of [...new Set(keys)].sort()) {
      const current=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
      if(current?.data?.expires_at>Date.now()) conflict('Another schedule is being saved. Retry shortly.');
      const result=await store.setJSON(key,{owner,expires_at:Date.now()+120000},current ? {onlyIfMatch:current.etag} : {onlyIfNew:true});
      if(!result?.modified) conflict('Another schedule is being saved. Retry shortly.');
      held.push(key);
    }
    return await run();
  } finally {
    for(const key of held.reverse()) {
      try {
        const current=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
        if(current?.data?.owner===owner) await store.setJSON(key,{owner,expires_at:0},{onlyIfMatch:current.etag});
      } catch { /* A crashed release expires after the bounded Function timeout. */ }
    }
  }
}

export async function updateTimetableParent(store,key,mutate) {
  for(let attempt=0;attempt<5;attempt++) {
    const current=await store.getWithMetadata(key,{type:'json',consistency:'strong'});
    const next=mutate(current?.data);
    if(!current) conflict('A parent was removed during scheduling.');
    const result=await store.setJSON(key,next,{onlyIfMatch:current.etag});
    if(result?.modified) return next;
  }
  conflict('The class or unit changed during scheduling. Retry to resume safely.');
}
