/** Shared browser/server validator. Personal history stays in private preferences. */
export const GROVE_HISTORY_MAX_BYTES = 128 * 1024;
export const GROVE_HISTORY_EVENTS = ['projects','competitions','excursions'];
export const GROVE_HISTORY_AREAS = ['teaching','gifted','halt','university','career','professional','life','health','wedding','unclassified'];
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
const fail = () => { throw new Error('Invalid Grove history file.'); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
export function validateGroveHistory(raw) {
  if (!exact(raw,['schema_version','years']) || raw.schema_version!==1 || !Array.isArray(raw.years) || raw.years.length>10 || new TextEncoder().encode(JSON.stringify(raw)).length>GROVE_HISTORY_MAX_BYTES) fail();
  const seen=new Set();let total=0;
  const years=raw.years.map(row=>{
    if (!exact(row,['year','weeks','terms','books','late_fraction',...GROVE_HISTORY_EVENTS]) || !Number.isInteger(row.year) || row.year<2000 || row.year>2100 || seen.has(row.year) || !Array.isArray(row.weeks) || row.weeks.length>53 || typeof row.late_fraction!=='number' || !Number.isFinite(row.late_fraction) || row.late_fraction<0 || row.late_fraction>1) fail();
    seen.add(row.year);const y=String(row.year);const own=d=>date(d)&&d.startsWith(y+'-');
    const weeks=row.weeks.map(w=>{
      if (!exact(w,['starts_on','ends_on','counts']) || !own(w.starts_on) || !own(w.ends_on) || w.ends_on<w.starts_on || !exact(w.counts,GROVE_HISTORY_AREAS)) fail();
      const start=new Date(w.starts_on+'T12:00:00Z');const monday=new Date(start);monday.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);
      if(w.starts_on!==[monday.toISOString().slice(0,10),y+'-01-01'].sort().at(-1) || w.ends_on!==[sunday.toISOString().slice(0,10),y+'-12-31'].sort()[0]) fail();
      const counts={};for(const area of GROVE_HISTORY_AREAS){const n=w.counts[area];if(!Number.isSafeInteger(n)||n<0||n>10000)fail();counts[area]=n;total+=n;if(total>100000)fail();}
      return {starts_on:w.starts_on,ends_on:w.ends_on,counts};
    }).sort((a,b)=>a.starts_on.localeCompare(b.starts_on));
    if(weeks.some((w,i)=>i>0&&w.starts_on<=weeks[i-1].ends_on))fail();
    const result={year:row.year,weeks,late_fraction:row.late_fraction};
    if(row.terms!==undefined){if(!Array.isArray(row.terms)||row.terms.length>4)fail();const ids=new Set();const terms=row.terms.map(t=>{if(!exact(t,['term','starts_on','ends_on'])||![1,2,3,4].includes(t.term)||ids.has(t.term)||!own(t.starts_on)||!own(t.ends_on)||t.ends_on<t.starts_on)fail();ids.add(t.term);return {term:t.term,starts_on:t.starts_on,ends_on:t.ends_on};}).sort((a,b)=>a.starts_on.localeCompare(b.starts_on));if(terms.some((t,i)=>i>0&&(t.starts_on<=terms[i-1].ends_on||t.term<=terms[i-1].term)))fail();result.terms=terms;}
    if(row.books!==undefined){if(!Array.isArray(row.books)||row.books.length>1000||row.books.some(d=>!own(d))||new Set(row.books).size!==row.books.length)fail();result.books=[...row.books].sort();}
    // Finished projects, competitions and excursions: one date each, so a day can repeat.
    for(const kind of GROVE_HISTORY_EVENTS)if(row[kind]!==undefined){if(!Array.isArray(row[kind])||row[kind].length>1000||row[kind].some(d=>!own(d)))fail();result[kind]=[...row[kind]].sort();}
    return result;
  }).sort((a,b)=>a.year-b.year);
  return {schema_version:1,years};
}
export function parseGroveHistory(raw) {try{return raw==null?undefined:validateGroveHistory(raw);}catch{return undefined;}}
