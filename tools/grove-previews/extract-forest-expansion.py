"""Read selected Unity package members as data. Never extract paths or execute scripts."""
import hashlib, json, pathlib, sys, tarfile
SELECTED = {'smesh_'+n+'.fbx' for n in ['bear','boar','moose','wolf','deer','stag','fox','rabbit']} | {'t_lowworld_forestanimals.png','LowWorld_ForestAnimalsKit_ReadMe.txt'}
def extract(archive, target):
 target=pathlib.Path(target);target.mkdir(parents=True,exist_ok=True);entries=[]
 with tarfile.open(archive,'r:gz') as package:
  for member in package.getmembers():
   if not member.isfile() or not member.name.endswith('/pathname'):continue
   source=package.extractfile(member).read().decode().strip();name=pathlib.PurePosixPath(source).name
   if name not in SELECTED:continue
   prefix=member.name.rsplit('/',1)[0];data=package.extractfile(prefix+'/asset').read();meta=package.extractfile(prefix+'/asset.meta').read()
   (target/name).write_bytes(data);(target/(name+'.meta')).write_bytes(meta)
   entries.append({'source':source,'file':name,'sha256':hashlib.sha256(data).hexdigest(),'metadata_sha256':hashlib.sha256(meta).hexdigest(),'bytes':len(data)})
 (target/'inventory.json').write_text(json.dumps(entries,indent=2)+'\n');return entries
if __name__=='__main__':print(json.dumps(extract(sys.argv[1],sys.argv[2]),indent=2))
