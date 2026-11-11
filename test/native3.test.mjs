import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {registerNative3} from '../src/native3.mjs';import {saveSettings3} from '../src/policy3.mjs';import {workflowAdmin} from '../src/workflows3.mjs';
test('unified route enforces Local and rejects unqualified Auto candidates',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'route3-')),old=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('offline fixture');};
 const effects=[],ctx={effect:f=>effects.push(f()),tools:{register:()=>()=>{}},agents:{get:()=>null}};
 try{const v3=await registerNative3(ctx,{root,config:{load:()=>({value:{connections:[{kind:'image',enabled:true}]}})}},x=>x),exec={agent:{session:{id:'owner'}},callId:'call'};
  await assert.rejects(v3.route({kind:'image',prompt:'test'},exec),/没有可执行/);assert.equal(network,6);
  saveSettings3(root,{mode:'Local',instances:[]});await assert.rejects(v3.route({kind:'image',prompt:'test'},exec),/未发现/);assert.equal(network,10);
  await assert.rejects(v3.route({kind:'music',prompt:'test'},exec),/不会切换收费/);assert.equal(network,10);
 }finally{globalThis.fetch=old;for(const off of effects.reverse())await off?.();fs.rmSync(root,{recursive:true,force:true});}
});

test('accepted submission survives unavailable host job controller and resume can retry tracking',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'job-controller-')),old=globalThis.fetch,effects=[],tools=new Map();let posts=0,starts=0,available=false;
 const ctx={effect:f=>effects.push(f()),tools:{register:t=>{tools.set(t.name,t);return()=>{};}},agents:{get:()=>({})},jobs:{start:()=>{starts++;if(!available)throw Error('no job controller');return 'attached';}}};
 try{
  saveSettings3(root,{mode:'Local'});await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'probe',document:{'1':{class_type:'EmptyImage',inputs:{width:64}},'2':{class_type:'SaveImage',inputs:{images:['1',0],filename_prefix:'test'}}}});
  globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/object_info')?{EmptyImage:{output:['IMAGE'],input:{required:{width:['INT',{min:1,max:8192}]}}},SaveImage:{output:[],output_node:true,input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{}]}}}}:String(url).endsWith('/prompt')?(posts++,{prompt_id:'original'}):String(url).includes('/history/')?{}:{queue_pending:[[0,'original']],queue_running:[]}));
  await registerNative3(ctx,{root},x=>x);const exec={agent:{session:{id:'owner'}},callId:'one'};
  const submitted=await tools.get('media_workflow').execute({action:'submit',templateId:'probe'},exec);
  assert.equal(submitted.status,'submitted');assert.equal(submitted.jobId,null);assert.match(submitted.backgroundWarning,/原任务/);assert.equal(posts,1);
  available=true;const resumed=await tools.get('media_workflow').execute({action:'resume',id:submitted.id},exec);assert.equal(resumed.jobId,'attached');assert.equal(posts,1);assert.equal(starts,2);
 }finally{globalThis.fetch=old;for(const off of effects.reverse())await off?.();fs.rmSync(root,{recursive:true,force:true});}
});


test('explicit workflowId is honored and never silently substituted by Auto selection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'explicit-route-')),old=globalThis.fetch,effects=[],tools=new Map();let posts=0;
 const ctx={effect:f=>effects.push(f()),tools:{register:t=>{tools.set(t.name,t);return()=>{};}},agents:{get:()=>({})},jobs:{start:()=>null}};
 try{
  saveSettings3(root,{mode:'Local',instances:[{id:'local',url:'http://127.0.0.1:1',trusted:true}]});
  await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'explicit',auto:false,document:{'1':{class_type:'EmptyImage',inputs:{width:64}},'2':{class_type:'SaveImage',inputs:{images:['1',0],filename_prefix:'test'}}}});
  const info={EmptyImage:{output:['IMAGE'],input:{required:{width:['INT',{min:1,max:8192}]}}},SaveImage:{output:[],output_node:true,input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{}]}}}};
  globalThis.fetch=async url=>{const u=String(url);if(u.endsWith('/object_info'))return new Response(JSON.stringify(info));if(u.endsWith('/prompt')){posts++;return new Response(JSON.stringify({prompt_id:'explicit-job'}));}if(u.includes('/history/'))return new Response(JSON.stringify({}));return new Response(JSON.stringify({queue_pending:[[0,'explicit-job']],queue_running:[]}));};
  const v3=await registerNative3(ctx,{root,config:{load:()=>({value:{connections:[]}})}},x=>x),exec={agent:{session:{id:'owner'}},callId:'explicit-call'};
  const r=await v3.route({kind:'image',prompt:'explicit request',workflowId:'explicit',instanceId:'local'},exec);
  assert.equal(r.selectedBackend,'Local');
  assert.equal(r.decision.selected.workflowId,'explicit');
  assert.equal(r.decision.selected.instanceId,'local');
  assert.equal(posts,1);
 }finally{globalThis.fetch=old;for(const off of effects.reverse())await off?.();fs.rmSync(root,{recursive:true,force:true});}
});
