export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k=>value[k] !== undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function meaningful(value) {
  if (Array.isArray(value)) {
    const list=value.map(meaningful);
    return list.every(v=>v && typeof v==='object' && v.block_type && v.id)?list.sort((a,b)=>a.id.localeCompare(b.id)):list;
  }
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([key])=>!['width','width_pct','width_percent'].includes(key)).map(([key,v])=>[key,meaningful(v)]));
  return value;
}
export function blockRevision(block) { return canonical({id:block.id,block_type:block.block_type,content:meaningful(block.content)}); }
export function contextSnapshot(entity) {
  const outline = blocks => (blocks || []).map(b=>({id:b.id,block_type:b.block_type,content:meaningful(b.content)})).sort((a,b)=>a.id.localeCompare(b.id));
  return {title:entity.title,description:entity.description,outcome_ids:entity.outcome_ids ?? entity.syllabus_outcomes,pedagogical_mode:entity.pedagogical_mode,blocks:outline(entity.blocks)};
}
export function findAlchemyBlock(blocks, id) {
  for (const b of blocks || []) {
    if (b.id === id) return b;
    const lists = b.block_type === 'section' ? [b.content.blocks] : b.block_type === 'columns' ? b.content.columns.map(c=>c.blocks) : b.block_type === 'tabs' ? b.content.tabs.map(t=>t.blocks) : [];
    for (const list of lists) { const found = findAlchemyBlock(list,id); if (found) return found; }
  }
  return null;
}
/** Model output may change prose but cannot replace identities, media or nested structure. */
export function protectedContentUnchanged(before, after) {
  if (before === null || typeof before !== 'object') return true;
  if (Array.isArray(before)) return Array.isArray(after) && before.length === after.length && before.every((v,i)=>protectedContentUnchanged(v,after[i]));
  if (!after || typeof after !== 'object' || Array.isArray(after)) return false;
  if(before.block_type){
    for(const key of Object.keys(before))if(key!=='content'&&canonical(before[key])!==canonical(after[key]))return false;
    for(const key of Object.keys(after))if(key!=='content'&&canonical(before[key])!==canonical(after[key]))return false;
  }
  for(const key of Object.keys(after))if(/^(id|.*_id|url|.*_url|provider)$/.test(key)&&canonical(before[key])!==canonical(after[key]))return false;
  return Object.entries(before).every(([key,value])=>{
    if (/^(id|.*_id|block_type|visibility|url|.*_url|provider)$/.test(key)) return canonical(value) === canonical(after[key]);
    if (typeof value === 'object' && value !== null) return protectedContentUnchanged(value,after[key]);
    return true;
  });
}
