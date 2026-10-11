/** Original Grove rig/loops for Poly by Google's CC-BY owl. */
import {NodeIO} from '@gltf-transform/core';
import {getBounds,prune,dedup} from '@gltf-transform/functions';
import sharp from 'sharp';
const io=new NodeIO(),doc=await io.read(process.argv[2]),root=doc.getRoot(),scene=root.listScenes()[0],node=root.listNodes()[0],buffer=root.listBuffers()[0];
const b=getBounds(scene),height=.55,scale=height/(b.max[1]-b.min[1]);
for(const p of node.getMesh().listPrimitives()) {
 const position=p.getAttribute('POSITION');for(let i=0;i<position.getCount();i++){const v=position.getElement(i,[]);position.setElement(i,[(v[0]-(b.min[0]+b.max[0])/2)*scale,(v[1]-b.min[1])*scale,(v[2]-(b.min[2]+b.max[2])/2)*scale]);}
}
for(const texture of root.listTextures())texture.setImage(await sharp(texture.getImage()).resize(256,256,{fit:'inside'}).png().toBuffer()).setMimeType('image/png');
const rig=doc.createNode('GroveOwlRig'),body=doc.createNode('owlBody').setTranslation([0,.15,0]),head=doc.createNode('owlHead').setTranslation([0,.24,0]),left=doc.createNode('owlLeftWing').setTranslation([.07,.07,0]),right=doc.createNode('owlRightWing').setTranslation([-.07,.07,0]);
rig.addChild(body);body.addChild(head).addChild(left).addChild(right);scene.addChild(rig);
const joints=[body,head,left,right],origins=[[0,.15,0],[0,.39,0],[.07,.22,0],[-.07,.22,0]];
const inverse=new Float32Array(origins.flatMap(([x,y,z])=>[1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1]));
const skin=doc.createSkin('GroveOwlSkin').setSkeleton(body).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(inverse).setBuffer(buffer));joints.forEach(j=>skin.addJoint(j));node.setSkin(skin);
for(const p of node.getMesh().listPrimitives()){
 const position=p.getAttribute('POSITION'),indices=new Uint16Array(position.getCount()*4),weights=new Float32Array(indices.length);
 for(let i=0;i<position.getCount();i++){
  const [x,y]=position.getElement(i,[]);let headWeight=Math.max(0,Math.min(1,(y-.32)/.08));let wingWeight=y>.12&&y<.34?Math.max(0,Math.min(1,(Math.abs(x)-.075)/.04)):0;wingWeight*=1-headWeight;
  indices.set([0,1,x>0?2:3,0],i*4);weights.set([1-headWeight-wingWeight,headWeight,wingWeight,0],i*4);
 }
 p.setAttribute('JOINTS_0',doc.createAccessor().setType('VEC4').setArray(indices).setBuffer(buffer));p.setAttribute('WEIGHTS_0',doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));
}
const quat=(axis,a)=>{const s=Math.sin(a/2);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(a/2)];};
for(const [name,duration] of [['idle',4],['hop',1],['fly',1.2],['eat',4]]){
 const animation=doc.createAnimation(name),times=Float32Array.from({length:49},(_,i)=>duration*i/48),input=doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
 const track=(target,path,values)=>{const output=doc.createAccessor().setType(path==='rotation'?'VEC4':'VEC3').setArray(new Float32Array(values)).setBuffer(buffer),sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(path).setSampler(sampler));};
 track(head,'rotation',Array.from(times,t=>name==='eat'?quat([1,0,0],.18*(1-Math.cos(t/duration*Math.PI*2))):quat([0,1,0],.10*Math.sin(t/duration*Math.PI*2))).flat());
 track(body,'translation',Array.from(times,t=>[0,.15+(name==='hop'?.035:name==='fly'?.008:.0015)*(1-Math.cos(t/duration*Math.PI*2)),0]).flat());
 if(name==='fly')for(const [j,sign]of [[left,1],[right,-1]])track(j,'rotation',Array.from(times,t=>quat([0,0,1],sign*.55*Math.sin(t/duration*Math.PI*2))).flat());
}
await doc.transform(prune(),dedup());await io.write(process.argv[3],doc);console.log('Exported Grove owl, original head/wing deformation and four loops.');
