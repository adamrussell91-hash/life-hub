import type {GroveDay} from './plan';
export function frameGroveDays(days:GroveDay[],focus:GroveDay|null,width:number,metres:number,mode:'auto'|'overview'|'clearing'):GroveDay[] {
  if(focus && (mode==='clearing' || (mode==='auto' && width<720 && 1/metres<4.5))) return [focus];
  return days;
}
