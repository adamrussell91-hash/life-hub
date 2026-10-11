import {createWorldPreview} from '@/grove-world-preview/renderer';
import type {WaterQuality} from '@/domain/grove/motion';
import type {AnnualGroveLoader} from '@/domain/grove/annual-loader';
import type {GroveSceneHandle,GroveCameraState} from './scene';
type AnnualScene=Awaited<ReturnType<AnnualGroveLoader['load']>>;
export async function mountAnnualGroveScene(host:HTMLElement,options:AnnualScene&{interactive?:boolean;wildlifePaused?:boolean;cameraState?:GroveCameraState;frameMode?:'overview'|'clearing';onPick?:(id:string|null,x:number,y:number)=>void;onWildlife?:(count:number,missing:string[],credits:string[])=>void}):Promise<GroveSceneHandle&{setQuality(quality:WaterQuality):void}>{
 const engine=createWorldPreview(host,(tree,x,y)=>options.onPick?.(tree.id,x,y),{heightScale:1,interactive:options.interactive,focusedDay:true});
 try{engine.showAnnual(options.worlds,'elevation',options.plan,options.meshes);const initialFrame=options.frameMode??(window.matchMedia('(max-width: 719px)').matches||options.plan.view==='day'?'clearing':'overview');engine.frame(initialFrame,false);if(options.cameraState)engine.restoreCamera(options.cameraState);engine.setMotionPaused(options.wildlifePaused??false);host.dataset.state='ready';host.dataset.frame=initialFrame;
 const observer=new MutationObserver(()=>{if(host.dataset.animalsReady==='true')options.onWildlife?.(Number(host.dataset.wildlifeCount??0),(host.dataset.unavailableWildlife??'').split(',').filter(Boolean),(host.dataset.wildlifeCredits??'').split(' · ').filter(Boolean));});observer.observe(host,{attributes:true,attributeFilter:['data-animals-ready']});
 return {setQuality:engine.setQuality,resize:engine.resize,frame(mode){engine.frame(mode);host.dataset.frame=mode;},cameraState:engine.cameraState,setWildlifePaused:engine.setMotionPaused,dispose(){observer.disconnect();engine.dispose();}};
 }catch(e){engine.dispose();throw e;}
}
