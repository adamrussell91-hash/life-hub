import bpy, math, os, json, argparse, sys
from mathutils import Vector, Quaternion
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--output',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);SOURCE=os.path.abspath(args.source);OUT=os.path.abspath(args.output);os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=SOURCE,load_ui=False,use_scripts=False)
if bpy.context.object and bpy.context.object.mode!='OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
for image in bpy.data.images:
 if 'palette' in image.name:
  image.filepath=os.path.join(os.path.dirname(SOURCE),'Animals Colour.png');image.reload()
bpy.context.scene.render.fps=24
report=[]
for meshname,rigname,filename,size,clips in [
 ('hare','hare rig','spring-hare-animated.glb',.04,{'idle':4,'hop':.8,'run':.6,'eat':4}),
 ('squirell','rig - squirell','spring-squirrel-animated.glb',.014,{'idle':4,'walk':1,'run':.65,'eat':4})]:
 rig=bpy.data.objects[rigname];mesh=bpy.data.objects[meshname]
 # Capture the publisher's current control pose before removing its single-frame action.
 bpy.context.scene.frame_set(1)
 controls=[p for p in rig.pose.bones if not p.name.startswith(('DEF-','ORG-','MCH-','VIS_'))]
 base={p.name:p.matrix_basis.copy() for p in controls}
 rig.animation_data_clear();rig.animation_data_create()
 for clip,duration in clips.items():
  action=bpy.data.actions.new('grove_'+meshname+'_'+clip);rig.animation_data.action=action
  frames=round(duration*24);duration=frames/24
  for frame in range(frames+1):
   phase=2*math.pi*frame/frames;wave=math.sin(phase)
   for p in controls:p.matrix_basis=base[p.name]
   def move(name,delta):
    p=rig.pose.bones.get(name)
    if p:p.location += p.bone.matrix_local.to_quaternion().inverted() @ Vector(delta)
   def turn(name,axis,angle):
    p=rig.pose.bones.get(name)
    if p:
     p.rotation_mode='QUATERNION';p.rotation_quaternion = base[name].to_quaternion() @ Quaternion(Vector(axis),angle)
   # Tiny breathing/attention movement, always looping back to the starting pose.
   move('torso',(0,0,size*.08*wave));turn('head',(1,0,0),.035*wave)
   turn('ear.L',(0,0,1),.055*wave);turn('ear.R',(0,0,1),-.04*wave)
   turn('tail.001',(0,0,1),.065*wave)
   if clip in ('hop','run','walk'):
    hop=clip=='hop' or (meshname=='hare' and clip=='run')
    move('torso',(0,0,size*(1-math.cos(phase))*.75))
    feet=['foot_ik.L','foot_ik.R'] + (['front_foot_ik.L','front_foot_ik.R'] if meshname=='hare' else ['hand_ik.L','hand_ik.R'])
    for i,name in enumerate(feet):
     offset=0 if hop and i<2 else math.pi if hop else (0 if i in (0,3) else math.pi)
     s=math.sin(phase+offset)
     move(name,(0,size*s,size*.8*max(0,s)))
    turn('head',(1,0,0),.06*wave)
    turn('tail.001',(1,0,0),.1*wave)
   if clip=='eat':
    nod=(1-math.cos(phase))/2
    turn('head',(1,0,0),.22*nod);move('torso',(0,-size*.3*nod,-size*.25*nod))
   for p in controls:
    p.keyframe_insert(data_path='location',frame=frame+1)
    p.keyframe_insert(data_path='rotation_quaternion',frame=frame+1)
  slot=rig.animation_data.action_slot
  rig.animation_data.action=None
  track=rig.animation_data.nla_tracks.new();track.name=clip
  strip=track.strips.new(clip,1,action);strip.action_slot=slot;strip.frame_end=frames+1;strip.extrapolation='NOTHING';strip.blend_type='REPLACE'
  report.append({'animal':meshname,'clip':clip,'duration':duration,'origin':'Grove procedural rig-control animation; not supplied by publisher'})
 for p in controls:p.matrix_basis=base[p.name]
 bpy.ops.object.select_all(action='DESELECT');mesh.hide_set(False);rig.hide_set(False);mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=mesh
 bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=97
 bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,filename),export_format='GLB',use_selection=True,export_def_bones=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_cameras=False,export_lights=False)
 print('EXPORTED',filename)
json.dump(report,open(os.path.join(OUT,'generated-animation-provenance.json'),'w'),indent=2)
