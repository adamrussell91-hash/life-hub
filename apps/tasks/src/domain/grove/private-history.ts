import {parseGroveHistory,type GroveHistory} from '../../../../../packages/grove-history/validate.mjs';
import {groveCompletions,type GroveTaskInput} from './plan';
import {addDays,daysBetween,weekdayIndex} from './dates';
import {toHubDateKey} from '@/domain/queries';
import type {GroveTerm} from './calendar';
import type {GroveBookInput} from './wildlife';
export {validateGroveHistory} from '../../../../../packages/grove-history/validate.mjs';
export type {GroveHistory} from '../../../../../packages/grove-history/validate.mjs';
const PREFIX='grove-history:v1:';
export const isGroveHistoryId=(id:string)=>id.startsWith(PREFIX);
const domainFor=(area:string)=>['teaching','gifted','halt'].includes(area)?'teaching':['life','health','wedding'].includes(area)?area:'other';
/** Completed inputs for Grove only. Never persist these through the task API. */
export function applyGroveHistory(input:{history?:unknown;tasks:readonly GroveTaskInput[];terms:readonly GroveTerm[];books:readonly GroveBookInput[];now:Date}):{tasks:GroveTaskInput[];terms:GroveTerm[];books:GroveBookInput[]} {
 const history=parseGroveHistory(input.history);const tasks=[...input.tasks];const books=[...input.books];let terms=[...input.terms];if(!history)return {tasks,terms,books};
 const today=toHubDateKey(input.now);const live=[...new Map(groveCompletions(input.tasks).completions.filter(c=>c.completedMs<=input.now.getTime()).map(c=>[c.id,c])).values()];const bookDates=new Set(books.map(b=>b.completed_on));
 for(const year of history.years){
  let historyIndex=0;
  if(year.terms?.length){terms=terms.filter(t=>!t.starts_on.startsWith(year.year+'-'));terms.push(...year.terms);}
  for(const day of year.books??[])if(day<=today&&!bookDates.has(day)){books.push({label:'Finished book',completed_on:day});bookDates.add(day);}
  for(const week of year.weeks){if(week.starts_on>today)continue;
   const baseline=new Map<string,number>();for(const [area,count] of Object.entries(week.counts)){const d=domainFor(area);baseline.set(d,(baseline.get(d)??0)+count);}
   const days=Array.from({length:daysBetween(week.starts_on,week.ends_on)+1},(_,i)=>addDays(week.starts_on,i)).filter(d=>d<=today);
   const weighted=days.flatMap(day=>Array.from({length:terms.some(t=>day>=t.starts_on&&day<=t.ends_on)&&weekdayIndex(day)<5?3:1},()=>day));
   for(const [domain,count] of baseline){const used=live.filter(c=>c.dayKey>=week.starts_on&&c.dayKey<=week.ends_on&&domainFor(c.domain)===domain).length;const remaining=Math.max(0,count-used);
    for(let i=0;i<remaining;i++){const late=Math.floor((historyIndex+1)*year.late_fraction)>Math.floor(historyIndex*year.late_fraction);historyIndex++;const day=weighted[Math.min(weighted.length-1,Math.floor((i+.5)*weighted.length/remaining))]!;const stamp=new Date(Math.min(Date.parse(day+'T02:00:00.000Z'),input.now.getTime())).toISOString();tasks.push({id:`${PREFIX}${year.year}:${week.starts_on}:${domain}:${i}`,title:`Finished ${domain==='other'?'work':domain+' work'}`,domain,status:'done',completed_at:stamp,due_date:late?addDays(day,-1):null});}
   }
  }
 }
 terms.sort((a,b)=>a.starts_on.localeCompare(b.starts_on));return {tasks,terms,books};
}
