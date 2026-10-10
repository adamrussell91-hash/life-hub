import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.argv[2]);await page.waitForFunction(()=>window.ready);const ids=await page.evaluate(()=>window.library.manifest.assets.map(a=>a.id));const reports=[];
 for(const id of ids){
  await page.selectOption('#species',id);await page.waitForFunction(id=>window.ready===id,id);
  const result=await page.evaluate(async id=>{
   const library=window.library,p=await library.create(id),b=await library.create(id,{baby:true});
   const parentBones=[],babyBones=[];p.object.traverse(n=>{if(n.isBone)parentBones.push(n)});b.object.traverse(n=>{if(n.isBone)babyBones.push(n)});
   if(!parentBones.length || parentBones.some(n=>babyBones.includes(n)))throw Error('Shared or absent skeleton '+id);
   if(Math.abs(b.object.scale.x/p.object.scale.x-.5)>1e-6)throw Error('Baby scale '+id);
   const before=babyBones.map(n=>n.quaternion.toArray());p.play('locomotion',0);p.update(.31);const unchanged=babyBones.every((n,i)=>n.quaternion.toArray().every((v,j)=>Math.abs(v-before[i][j])<1e-9));if(!unchanged)throw Error('Parent animation changes baby '+id);
   let unknownRejected=false;try{p.play('missing-clip')}catch{unknownRejected=true;}if(!unknownRejected)throw Error('Missing clip silently accepted');
   p.dispose();b.dispose();return {id,independent_skeleton:true,baby_scale:.5,missing_clip_rejected:true,clips:window.currentAnimals[0].clips};
  },id);reports.push(result);
  for(const name of result.clips)await page.getByRole('button',{name,exact:true}).click();
 }
 await page.selectOption('#species','animal-duck-mallard');await page.waitForFunction(()=>window.ready==='animal-duck-mallard');await page.getByRole('button',{name:'swim',exact:true}).click();await page.waitForTimeout(400);
 if(errors.length)throw Error(errors.join('\n'));
 await page.screenshot({path:process.argv[3]+'/previews/live-demo.png',fullPage:true});await fs.writeFile(process.argv[3]+'/demo-report.json',JSON.stringify(reports,null,2)+'\n');console.log('PASS: '+reports.length+' animals; every clip selectable; independent skeletons, half-size babies and explicit missing-clip errors.');
}finally{await browser.close();}
