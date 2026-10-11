import unittest, importlib.util, pathlib, tempfile, tarfile, io
class ExtractTest(unittest.TestCase):
 def test_extracts_only_requested_model_and_metadata(self):
  spec=importlib.util.spec_from_file_location('extract',pathlib.Path(__file__).with_name('extract-forest-expansion.py'));mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
  with tempfile.TemporaryDirectory() as tmp:
   archive=pathlib.Path(tmp)/'test.tar.gz'
   with tarfile.open(archive,'w:gz') as t:
    for name,data in [('x/pathname',b'Assets/../../smesh_bear.fbx'),('x/asset',b'model'),('x/asset.meta',b'meta'),('y/pathname',b'Assets/evil.cs'),('y/asset',b'code')]:
     member=tarfile.TarInfo(name);member.size=len(data);t.addfile(member,io.BytesIO(data))
   result=mod.extract(archive,pathlib.Path(tmp)/'out');self.assertEqual([a['file'] for a in result],['smesh_bear.fbx']);self.assertEqual((pathlib.Path(tmp)/'out/smesh_bear.fbx').read_bytes(),b'model');self.assertFalse((pathlib.Path(tmp)/'out/evil.cs').exists())
if __name__=='__main__':unittest.main()
