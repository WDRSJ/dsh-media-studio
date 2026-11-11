import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {resourcePolicy31} from '../src/resource-policy31.mjs';import {saveModelMetadata31} from '../src/model-resources31.mjs';
test('CPU system memory never admits diffusion; explicit complex-model estimates are instance-bound and conservative',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'resource31-'));
 try{
  const checkpoint={a:{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:'installed'}}};
  assert.equal(resourcePolicy31(root,checkpoint,'local',[{type:'cpu',vram_free:32*1024**3}]).available,false);
  const gpu=[{type:'cuda',vram_free:8*1024**3}],complex={a:{class_type:'UNETLoader',inputs:{unet_name:'net'}},b:{class_type:'VAELoader',inputs:{vae_name:'vae'}}};
  assert.match(resourcePolicy31(root,complex,'local',gpu).reason,/未登记/);
  saveModelMetadata31(root,{instanceId:'local',loader:'UNETLoader',input:'unet_name',name:'net',minimumVRAMMB:5000});
  saveModelMetadata31(root,{instanceId:'local',loader:'VAELoader',input:'vae_name',name:'vae',minimumVRAMMB:1000});
  const estimate=resourcePolicy31(root,complex,'local',gpu);assert.equal(estimate.requiredVRAMMB,6000);assert.equal(estimate.availableVRAMMB,8192);
  assert.equal(resourcePolicy31(root,complex,'other',gpu).available,false);
  assert.equal(resourcePolicy31(root,{a:{class_type:'EmptyImage',inputs:{width:64}}},'local',[{type:'cpu'}]).requiredVRAMMB,0);
  assert.throws(()=>saveModelMetadata31(root,{instanceId:'local',loader:'UNETLoader',input:'unet_name',name:'net',minimumVRAMMB:-1}),/显存/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
