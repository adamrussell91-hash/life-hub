import {transferGroveRelease} from './lib/grove-release-transfer.mjs';
try {
 const result=await transferGroveRelease(process.cwd(),{deploymentKey:process.env.GROVE_ASSET_KEY,inputKey:process.env.GROVE_RELEASE_INPUT_KEY});
 console.log(result.skipped?'No Grove release input; transfer skipped.':'Verified twenty-model Grove release transferred with deployment key continuity.');
} catch {
 // Do not include archive diagnostics, paths, key values or decrypted content in Actions logs.
 console.error('Grove release transfer failed; verify both keys and the authenticated twenty-model input.');
 process.exitCode=1;
}
