import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {autoDecision3} from '../src/auto3.mjs';import {registerNative3} from '../src/native3.mjs';import {workflowAdmin} from '../src/workflows3.mjs';
async function bindCheckpoint(root,model){const t=await workflowAdmin(root,{action:'export',templateId:'txt2img'});t.graph['3'].inputs.ckpt_name=model;await workflowAdmin(root,{action:'save',id:t.id,expectedVersion:t.version,document:t});}
test('Auto cloud route binds selected account and tier, respects zero budget and avoids local discovery for explicit account',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'auto-route-'));const effects=[];let probes=0;
 const runtime={root,vault:{has:()=>true},config:{load:()=>({value:{connections:[{id:'costly',kind:'image',enabled:true,protocol:'openai-image',endpoint:'https://fixture.invalid/v1',modelPreview:'a',modelQuality:'b',credentialRef:'test',pricing:{rate:2,currency:'CNY',unit:'request'}},{id:'cheap',kind:'image',enabled:true,protocol:'openai-image',endpoint:'https://fixture.invalid/v1',modelPreview:'c',modelQuality:'d',credentialRef:'test',pricing:{rate:0.1,currency:'CNY',unit:'request'}}],customProviders:[]}})}};
 try{
  const args={kind:'image',prompt:'test',tier:'standard',budgetCNY:1};
  const d=await autoDecision3(runtime,args,'owner',{discover:async()=>[]});assert.equal(d.selected.connectionId,'cheap');assert.equal(d.selected.tier,'standard');
  assert.equal((await autoDecision3(runtime,{...args,budgetCNY:0},'owner',{discover:async()=>[]})).selected,null);
  const v3=await registerNative3({effect:f=>effects.push(f()),tools:{register:()=>()=>{}},agents:{get:()=>null}},runtime,x=>x);
  const result=await v3.route({...args,connectionId:'cheap'},{agent:{session:{id:'owner'}},callId:'call'});
  assert.equal(result.cloudArgs.connectionId,'cheap');assert.equal(result.cloudArgs.tier,'standard');assert.equal(result.cloudArgs.budgetCNY,1);
 }finally{for(const off of effects.reverse())await off?.();fs.rmSync(root,{recursive:true,force:true});}
});
test('Auto refuses an installed checkpoint when actual workflow nodes or models fail inspection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'auto-dependency-'));const runtime={root,config:{load:()=>({value:{connections:[]}})}};let checked;
 try{
  await bindCheckpoint(root,'installed');
  const result=await autoDecision3(runtime,{kind:'image',prompt:'safe',budgetCNY:0},'owner',{discover:async()=>[{id:'local',local:true,available:true,checkpoints:['installed'],devices:[{type:'cuda',vram_free:8192*1048576}]}],inspect:async a=>{checked=a;return{compatible:false,issues:['缺少节点 VAEDecode']};}});
  assert.equal(result.selected,null);assert.equal(checked.values.model,'installed');assert.match(result.rejected[0].reason,/VAEDecode/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Auto excludes low VRAM local candidates and retains per-instance memory',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'auto-vram-'));const runtime={root,config:{load:()=>({value:{connections:[]}})}};
 try{await bindCheckpoint(root,'model');const discover=async()=>[{id:'tiny',local:true,available:true,checkpoints:['model'],devices:[{type:'cuda',vram_free:1024*1048576}]},{id:'fit',local:true,available:true,checkpoints:['model'],devices:[{type:'cuda',vram_free:8192*1048576}]}];
 const d=await autoDecision3(runtime,{kind:'image',prompt:'test',budgetCNY:0},'owner',{discover,inspect:async()=>({compatible:true,issues:[]})});assert.equal(d.selected.instanceId,'fit');assert.ok(d.rejected.some(r=>r.id==='local:tiny'&&r.reason==='显存不足'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Auto cloudOnly excludes local workflows and localOnly excludes cloud candidates',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'auto-scope-'));const runtime={root,vault:{has:()=>true},config:{load:()=>({value:{connections:[{id:'cheap',kind:'image',enabled:true,protocol:'openai-image',endpoint:'https://fixture.invalid/v1',modelPreview:'a',modelQuality:'b',credentialRef:'test',pricing:{rate:0.1,currency:'CNY',unit:'request'}}],customProviders:[]}})}};
 try{
  await bindCheckpoint(root,'installed');
  const discover=async()=>[{id:'local',local:true,available:true,checkpoints:['installed'],devices:[{type:'cuda',vram_free:8192*1048576}]}];
  const cloud=await autoDecision3(runtime,{kind:'image',prompt:'x',budgetCNY:1},'owner',{discover,inspect:async()=>({compatible:true,issues:[]}),cloudOnly:true});
  assert.equal(cloud.selected.source,'cloud');assert.ok(!cloud.rejected.some(x=>String(x.id).startsWith('local:')));
  const local=await autoDecision3(runtime,{kind:'image',prompt:'x',budgetCNY:1},'owner',{discover:async()=>[],inspect:async()=>({compatible:true,issues:[]}),localOnly:true});
  assert.equal(local.selected,null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
