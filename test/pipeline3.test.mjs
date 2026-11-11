import {simulatedMedia53} from './simulated-media53.mjs';
const pipeline3=(root,args,owner,deps={})=>pipelineCore53(root,args,owner,{verify:simulatedMedia53,...deps});
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';import path from 'node:path';import fs from 'node:fs';
import {pipeline3 as pipelineCore53,validatePipeline} from '../src/pipeline3.mjs';

test('resume reuses source after encoder failure, refuses changed artifacts and keeps owner boundary',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-pipeline-')),owner='owner';
 let submitted=0,checked=0,fail=true;
 const source=path.join(root,'source.png');fs.writeFileSync(source,'fixture');
 const opts={authorize:({source})=>{assert.equal(source,'local');checked++;},
  comfyCall:async(_root,args)=>args.action==='submit'?(submitted++,{id:'job',promptId:'prompt'}):{state:'completed',file:source},
  encode:async(_root,input,out)=>{if(fail)throw Error('test failure');fs.copyFileSync(input,out);}};
 try {
  const create={action:'create',callId:'one',template:'probe'};
  const task=await pipeline3(root,create,owner);
  assert.equal((await pipeline3(root,create,owner)).id,task.id);
  await assert.rejects(pipeline3(root,{...create,seconds:3},owner),/重复请求标识/);
  const resume={action:'resume',id:task.id};
  await assert.rejects(pipeline3(root,resume,'other',opts));
  await assert.rejects(pipeline3(root,resume,owner,opts),/test failure/);
  fail=false;const result=await pipeline3(root,resume,owner,opts);
  assert.equal(result.state,'completed');assert.equal(submitted,1);assert.equal(checked,3);
  assert.equal(result.stages[1].inputs[0].sha256,result.stages[0].output.sha256);
  fs.writeFileSync(result.stages[0].output.file,'modified');await assert.rejects(pipeline3(root,resume,owner,opts),/变化/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('unknown submit never retried and cyclic or unsupported graphs rejected',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-pipeline-'));let submits=0;
 try{const task=await pipeline3(root,{action:'create',template:'probe'},'owner');const args={action:'resume',id:task.id};
 const opts={authorize:()=>{},comfyCall:async()=>{submits++;throw Error('connection lost');}};
 await assert.rejects(pipeline3(root,args,'owner',opts));await assert.rejects(pipeline3(root,args,'owner',opts),/禁止重提/);assert.equal(submits,1);
 assert.throws(()=>validatePipeline([{id:'x',executor:'ffmpeg-video',dependencies:['x']}]));
 assert.throws(()=>validatePipeline([{id:'x',executor:'untrusted-code'}]));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('generic workflow stages transfer owner-bound archived inputs and resume without repeating completed generation',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-dag31-'));let submitted=0,fail=true;
 const source=path.join(root,'fixture.png');fs.writeFileSync(source,'simulated-pipeline-artifact');
 const spec=[{id:'source',executor:'comfy-workflow',params:{kind:'image',templateId:'source',values:{canvasWidth:256}}},{id:'edit',executor:'comfy-workflow',dependencies:['source'],params:{kind:'image',templateId:'edit',inputMappings:{image:'source'}}}];
 const options={authorize:({source})=>assert.equal(source,'local'),comfyCall:async(_root,a)=>{
  if(a.action==='poll')return{state:'completed',file:source};if(a.action==='reconcile')return{state:'uncertain'};
  if(a.templateId==='edit'){assert.equal(a.inputs.image.kind,'image');assert.ok(fs.existsSync(a.inputs.image.file));if(fail)throw Error('ambiguous transport');}
  submitted++;return{id:'job-'+a.templateId};
 }};
 try{
  const created=await pipeline3(root,{action:'create',spec,callId:'unique'},'owner');
  await assert.rejects(pipeline3(root,{action:'resume',id:created.id},'owner',options),/ambiguous/);
  const persisted=await pipeline3(root,{action:'get',id:created.id},'owner');assert.equal(persisted.stages[0].state,'completed');assert.equal(persisted.stages[1].state,'uncertain');assert.equal(persisted.stages[1].inputs[0].sha256,persisted.stages[0].output.sha256);
  fail=false;await assert.rejects(pipeline3(root,{action:'resume',id:created.id},'owner',options),/禁止重提/);assert.equal(submitted,1);
  const bad=structuredClone(spec);bad[1].params.inputMappings.image='outside';assert.throws(()=>validatePipeline(bad),/映射/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('pause persists and automatic resume cannot clear it; explicit continue retains completed stages',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pause31-')),source=path.join(root,'source.png');fs.writeFileSync(source,'fixture');let submits=0;
 try{
  const p=await pipeline3(root,{action:'create',spec:[{id:'one',executor:'comfy-image',params:{template:'probe'}}]},'owner');
  await pipeline3(root,{action:'pause',id:p.id},'owner');assert.equal((await pipeline3(root,{action:'resume',id:p.id},'owner')).state,'paused');
  const opts={authorize:()=>{},comfyCall:async(_r,a)=>a.action==='submit'?(submits++,{id:'receipt'}):{state:'completed',file:source}};
  assert.equal((await pipeline3(root,{action:'continue',id:p.id},'owner',opts)).state,'completed');assert.equal(submits,1);
  await pipeline3(root,{action:'resume',id:p.id},'owner',opts);assert.equal(submits,1);
  await assert.rejects(pipeline3(root,{action:'pause',id:p.id},'other'),/找不到/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('stop during an active stage persists without global interruption and prevents every subsequent stage',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stop31-')),source=path.join(root,'source.png');fs.writeFileSync(source,'fixture');let accepted,release,submits=0,encodes=0;
 const entered=new Promise(r=>accepted=r),gate=new Promise(r=>release=r);
 try{
  const p=await pipeline3(root,{action:'create',template:'probe'},'owner');
  const running=pipeline3(root,{action:'resume',id:p.id},'owner',{authorize:()=>{},comfyCall:async(_root,a)=>{if(a.action==='submit'){submits++;accepted();await gate;return{id:'original'};}return{state:'completed',file:source};},encode:async()=>{encodes++;}});
  await entered;const stop=await pipeline3(root,{action:'cancel',id:p.id},'owner');assert.equal(stop.state,'cancel-requested');release();
  const done=await running;assert.equal(done.state,'cancelled');assert.equal(done.stages[0].state,'completed');assert.equal(done.stages[1].state,'pending');assert.equal(encodes,0);assert.equal(submits,1);
  assert.equal((await pipeline3(root,{action:'continue',id:p.id},'owner')).state,'cancelled');assert.equal((await pipeline3(root,{action:'pause',id:p.id},'owner')).state,'cancelled');
 }finally{release?.();fs.rmSync(root,{recursive:true,force:true});}
});
