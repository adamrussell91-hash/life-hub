import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const grove=process.env.GROVE_OUTPUT_DIR ? path.resolve(process.env.GROVE_OUTPUT_DIR) : path.join(repo,'apps/life/assets/grove');
const manifest=JSON.parse(await fs.readFile(path.join(grove,'manifest.json')));
const html=`<!doctype html><html><head><style>body{margin:0}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script></head><body><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(512,512);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
window.renderAsset=async(file)=>{
 const gltf=await loader.loadAsync('/grove/'+file);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#eeeeee');
 scene.add(new THREE.HemisphereLight(0xffffff,0x9eab97,2));
 const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(4,8,6);scene.add(light);
 const model=gltf.scene;scene.add(model);model.updateMatrixWorld(true);
 const initial=new THREE.Box3().setFromObject(model,true);
 const animationChecks=[];
 for(const clip of gltf.animations){
  const mixer=new THREE.AnimationMixer(model);const action=mixer.clipAction(clip);action.play();
  mixer.setTime(0);model.updateMatrixWorld(true);
  const before=[];model.traverse(n=>before.push(...n.matrixWorld.elements));
  mixer.setTime(Math.min(.37,clip.duration*.43));model.updateMatrixWorld(true);
  const after=[];model.traverse(n=>after.push(...n.matrixWorld.elements));
  animationChecks.push({name:clip.name,duration:clip.duration,moves:before.some((v,i)=>Math.abs(v-after[i])>1e-5)});
  mixer.stopAllAction();mixer.uncacheRoot(model);
 }
 if(gltf.animations.length){const mixer=new THREE.AnimationMixer(model);mixer.clipAction(gltf.animations.find(a=>a.name==='idle')||gltf.animations[0]).play();mixer.setTime(.2);}
 model.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(model,true),center=box.getCenter(new THREE.Vector3());
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.001,1000);
 camera.position.copy(center).add(new THREE.Vector3(.85,.65,1).normalize().multiplyScalar(50));camera.lookAt(center);camera.updateMatrixWorld(true);
 const points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
 const extent=Math.max(...points.flatMap(p=>[Math.abs(p.x),Math.abs(p.y)]))*1.14;
 camera.left=-extent;camera.right=extent;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix();
 renderer.render(scene,camera);
 const report={file,height_m:initial.max.y-initial.min.y,bounds:{min:initial.min.toArray(),max:initial.max.toArray()},animations:animationChecks};
 model.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}}});
 return report;
};window.ready=true;
</script></body></html>`;
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  const base=u.pathname.startsWith('/three/')?path.join(here,'node_modules/three'):grove;
  const relative=decodeURIComponent(u.pathname.replace(/^\/(three|grove)\//,''));
  const file=path.resolve(base,relative);if(!file.startsWith(base+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.glb')?'model/gltf-binary':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.GROVE_CHROMIUM?{executablePath:process.env.GROVE_CHROMIUM}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
 await fs.mkdir(path.join(grove,'previews'),{recursive:true});
 const reports=[];
 for(const asset of manifest.assets){
  const report=await page.evaluate(file=>window.renderAsset(file),asset.file);
  report.sha256=createHash('sha256').update(await fs.readFile(path.join(grove,asset.file))).digest('hex');
  if(report.animations.some(a=>!a.moves))throw Error(`Non-moving animation in ${asset.id}`);
  // Browser-measured bounds include skinning; these are the engine's actual dimensions.
  asset.height_m=+report.height_m.toFixed(4);reports.push(report);
  const png=await page.screenshot();
  await sharp(png).png({palette:true,colours:128,compressionLevel:9}).toFile(path.join(grove,asset.preview));
  console.log(asset.id,report.height_m.toFixed(3));
 }
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile(path.join(grove,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(process.env.GROVE_RENDER_REPORT || path.join(here,'render-report.json'),JSON.stringify(reports,null,2)+'\n');
 const cols=6,w=256,h=278,rows=Math.ceil(manifest.assets.length/cols),layers=[];
 for(const [i,asset]of manifest.assets.entries()){
  const left=(i%cols)*w,top=Math.floor(i/cols)*h;
  layers.push({input:await sharp(path.join(grove,asset.preview)).resize(236,236).toBuffer(),left:left+10,top});
  const label=asset.id;
  layers.push({input:Buffer.from(`<svg width="256" height="42"><rect width="256" height="42" fill="#eeeeee"/><text x="128" y="20" text-anchor="middle" font-family="Arial" font-size="11">${label}.glb</text></svg>`),left,top:top+236});
 }
 await sharp({create:{width:w*cols,height:h*rows,channels:3,background:'#eeeeee'}}).composite(layers).png({palette:true,colours:128,compressionLevel:9}).toFile(path.join(grove,'previews/_sheet.png'));
}finally{await browser.close();server.close();}
