import bpy,math,os,json,argparse,sys
from mathutils import Vector
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--output',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);os.makedirs(os.path.dirname(os.path.abspath(args.output)),exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.source)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();mesh=bpy.context.object;mesh.name='GroveMallard'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
ps=[v.co for v in mesh.data.vertices];lo=Vector([min(p[a] for p in ps) for a in range(3)]);hi=Vector([max(p[a] for p in ps) for a in range(3)]);h=hi.z-lo.z
# The normalised publisher model faces -Y in Blender (+Z in glTF).
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));rig=bpy.context.object;rig.name='GroveMallardRig';rig.data.edit_bones.remove(rig.data.edit_bones[0])
body=rig.data.edit_bones.new('body');body.head=(0,0,h*.38);body.tail=(0,0,h*.62)
head=rig.data.edit_bones.new('head');head.head=(0,lo.y*.48,h*.62);head.tail=(0,lo.y*.48,h*.85);head.parent=body
for side,sign in [('left',1),('right',-1)]:
 b=rig.data.edit_bones.new(side+'_leg');b.head=(sign*(hi.x-lo.x)*.22,0,h*.25);b.tail=(sign*(hi.x-lo.x)*.22,0,0);b.parent=body
bpy.ops.object.mode_set(mode='OBJECT')
groups={n:mesh.vertex_groups.new(name=n) for n in ['body','head','left_leg','right_leg']}
for v in mesh.data.vertices:
 p=v.co
 if p.z<h*.26:n='left_leg' if p.x>=0 else 'right_leg';weights={n:1}
 else:
  # Neck blend avoids a hard seam when the duck looks down.
  w=max(0,min(1,(p.z-h*.53)/(h*.18)))*max(0,min(1,(-p.y-h*.05)/(h*.18)))
  weights={'body':1-w,'head':w}
 for n,w in weights.items():
  if w>0:groups[n].add([v.index],w,'REPLACE')
mesh.modifiers.new('Grove duck deformation','ARMATURE').object=rig
rig.animation_data_create();bpy.context.scene.render.fps=24
for clip,duration in [('idle',4),('walk',1),('swim',2),('eat',4)]:
 action=bpy.data.actions.new(clip);rig.animation_data.action=action;frames=round(duration*24)
 for frame in range(frames+1):
  t=2*math.pi*frame/frames;s=math.sin(t)
  for p in rig.pose.bones:p.location=(0,0,0);p.rotation_mode='XYZ';p.rotation_euler=(0,0,0)
  rig.pose.bones['head'].rotation_euler.x=.04*s
  rig.pose.bones['body'].location.z=h*.006*(1-math.cos(t))
  if clip=='walk':
   rig.pose.bones['left_leg'].rotation_euler.x=.3*s;rig.pose.bones['right_leg'].rotation_euler.x=-.3*s
   rig.pose.bones['body'].rotation_euler.y=.025*s
  if clip=='swim':
   rig.pose.bones['left_leg'].rotation_euler.x=.38*s;rig.pose.bones['right_leg'].rotation_euler.x=-.38*s
   rig.pose.bones['body'].rotation_euler.y=.035*s
   rig.pose.bones['body'].location.z=h*.01*(1-math.cos(t))
  if clip=='eat':rig.pose.bones['head'].rotation_euler.x=.42*(1-math.cos(t))/2
  for p in rig.pose.bones:p.keyframe_insert(data_path='location',frame=frame+1);p.keyframe_insert(data_path='rotation_euler',frame=frame+1)
 slot=rig.animation_data.action_slot;rig.animation_data.action=None;track=rig.animation_data.nla_tracks.new();track.name=clip;strip=track.strips.new(clip,1,action);strip.action_slot=slot;strip.blend_type='REPLACE';strip.extrapolation='NOTHING'
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=mesh
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=97
bpy.ops.export_scene.gltf(filepath=args.output,export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_frame_range=False,export_cameras=False,export_lights=False)
print('EXPORTED_MALLARD',list(lo),list(hi))
