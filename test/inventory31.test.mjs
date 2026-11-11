import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inventory31} from '../src/inventory31.mjs';
import {workflowAdmin} from '../src/workflows3.mjs';
import {saveSettings3,loadSettings3} from '../src/policy3.mjs';
import {preparation52} from '../src/import-authority52.mjs';

const info={
  CheckpointLoaderSimple:{input:{required:{ckpt_name:[['sd15.safetensors'],{}]}},output:['MODEL']},
  UNETLoader:{input:{required:{unet_name:[['z-image-turbo.safetensors','moss-image.safetensors','wan2.2_ti2v_5B_fp16.safetensors'],{}]}},output:['MODEL']},
  VAELoader:{input:{required:{vae_name:[['z-image-vae.safetensors'],{}]}},output:['VAE']},
  CLIPLoader:{input:{required:{clip_name:[['t5xxl.safetensors'],{}]}},output:['CLIP']},
  SaveImage:{input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{}]}},output_node:true,output:[]}
};
test('inventory reports every loader, per-instance identity, workflow names and real verification without disk-wide guesses',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'inventory31-')),oldFetch=globalThis.fetch,calls=[];
  try{
    saveSettings3(root,{...loadSettings3(root),instances:[
      {id:'a',label:'本地 A',url:'http://127.0.0.1:18194',trusted:true,local:true,enabled:true},
      {id:'b',label:'本地 B',url:'http://127.0.0.1:18195',trusted:true,local:true,enabled:true},
      {id:'off',label:'离线',url:'http://127.0.0.1:18196',trusted:true,local:true,enabled:true}
    ]});
    globalThis.fetch=async url=>{
      calls.push(String(url));
      if(!String(url).includes(':18194')&&!String(url).includes(':18195'))throw Error('offline fixture');
      if(String(url).includes('/system_stats'))return new Response(JSON.stringify({system:{comfyui_version:'0.44.2'}}));
      if(String(url).includes('/object_info'))return new Response(JSON.stringify(info));
      throw Error('unexpected '+url);
    };
    await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'wf',name:'ZImage 高质量图片',document:{'1':{class_type:'UNETLoader',inputs:{unet_name:'z-image-turbo.safetensors'}},'2':{class_type:'SaveImage',inputs:{images:['1',0],filename_prefix:'x'}}},kind:'image',enabled:true});
    const jobs=path.join(root,'workflows3/jobs');fs.mkdirSync(jobs,{recursive:true});
    fs.writeFileSync(path.join(jobs,'done.json'),JSON.stringify({id:'done',templateId:'wf',kind:'image',status:'completed',files:[{path:'x.png',verification:{verified:true}}]}));
    const inv=await inventory31(root);
    assert.ok(inv.models.some(m=>m.name==='z-image-turbo.safetensors'&&m.architecture==='z-image'));
    assert.ok(inv.models.some(m=>m.name==='moss-image.safetensors'&&m.architecture==='moss'));
    assert.ok(inv.models.some(m=>m.name==='wan2.2_ti2v_5B_fp16.safetensors'&&m.architecture==='wan2.2'));
    assert.equal(inv.models.filter(m=>m.name==='z-image-turbo.safetensors').length,2);
    assert.deepEqual(new Set(inv.models.map(m=>m.instanceId)),new Set(['a','b']));
    assert.equal(inv.instances.find(i=>i.id==='off').available,false);
    assert.equal(inv.workflows.find(w=>w.id==='wf').displayName,'ZImage 高质量图片');
    assert.equal(inv.workflows.find(w=>w.id==='wf').verified,true);
    assert.equal(inv.summary.realVerifiedJobs,1);
    assert.ok(!calls.some(u=>u.includes(':8188')),'unconfigured daily 8188 must not be probed');
  }finally{globalThis.fetch=oldFetch;fs.rmSync(root,{recursive:true,force:true});}
});
