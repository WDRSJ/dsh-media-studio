import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {pipelinePresets31,savePipelinePreset31} from '../src/pipeline-presets31.mjs';
test('named pipeline presets persist only declarations, reject stale edits and secret values, and never create jobs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipeline-presets31-'));try{
  const input={id:'p',name:'local plan',spec:[{id:'image',name:'source',executor:'comfy-workflow',params:{kind:'image',templateId:'txt2img',values:{width:128}}}]};
  const first=savePipelinePreset31(root,input);assert.equal(first.version,1);assert.equal(first.stages[0].state,undefined);assert.equal(fs.existsSync(path.join(root,'pipelines-v3/jobs.sqlite')),false);
  assert.equal(savePipelinePreset31(root,{...input,expectedVersion:1,name:'updated'}).version,2);assert.throws(()=>savePipelinePreset31(root,{...input,expectedVersion:1}),/版本已变化/);
  assert.equal(pipelinePresets31(root)[0].name,'updated');const bad=structuredClone(input);bad.id='secret';bad.spec[0].params.values.api_key='not-a-real-key';assert.throws(()=>savePipelinePreset31(root,bad),/凭证/);assert.equal(pipelinePresets31(root).length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
