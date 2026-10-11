/** Shared cosmetic clock: derived history/geography never reads this state. */
export const WATER_PERIOD=80;
export type WaterQuality='low'|'medium'|'high';
export function qualitySettings(quality:WaterQuality){
 const settings={low:{detail:0,particlesPerFall:0},medium:{detail:1,particlesPerFall:8},high:{detail:2,particlesPerFall:24}}[quality];
 if(!settings)throw Error('Unknown water quality');return settings;
}
export class GroveMotionClock{
 private previous:number|null=null;
 private elapsed=0;
 tick(milliseconds:number,active:boolean){
  if(!Number.isFinite(milliseconds))throw Error('Invalid animation frame time');
  let delta=0;
  if(active){if(this.previous!==null)delta=Math.max(0,Math.min(.1,(milliseconds-this.previous)/1000));this.previous=milliseconds;this.elapsed+=delta;}
  else this.previous=null;
  return {seconds:this.elapsed,phase:this.elapsed%WATER_PERIOD,delta};
 }
}
