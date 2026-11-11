import {simulatedMedia53} from './simulated-media53.mjs';
const pipeline3=(root,args,owner,deps={})=>pipelineCore53(root,args,owner,{verify:simulatedMedia53,...deps});
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Runtime} from '../src/runtime.mjs';import {registerNative3} from '../src/native3.mjs';
import {pipeline3 as pipelineCore53} from '../src/pipeline3.mjs';
test('hybrid native job cancellation never reaches provider transport',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hybrid-auth-'));let calls=0,questions=0;const runtime=new Runtime(root,{vault:{has:()=>true,get:()=> 'fixture-only'},transport:async()=>{calls++;throw Error('must not submit');}}),effects=[],tools=new Map(),jobs=[];
 try{
  const c=runtime.config.load();c.value.connections.push({id:'fixture',providerId:'openai',kind:'image',label:'test',enabled:true,endpoint:'https://example.test/v1',protocol:'openai-image',modelPreview:'fixture',modelQuality:'fixture',voice:'',credentialRef:'stored:test',pricing:{rate:0.1,unit:'request',currency:'CNY',source:'test'}});runtime.config.save(c.value,c.revision);
  const ctx={effect:f=>effects.push(f()),tools:{register:t=>{tools.set(t.name,t);return()=>{};}},agents:{get:()=>({session:{id:'owner'}})},jobs:{start:spec=>{const job=spec.run({append(){},updateProgress(){}});jobs.push(job);return 'job';}},userQuestions:{ask:async q=>(questions++,{answers:[{id:q.questions[0].id,selected:['取消']}]})}};
  await registerNative3(ctx,runtime,x=>x);
  const result=await tools.get('media_pipeline').execute({action:'create',specJSON:JSON.stringify([{id:'cloud',executor:'cloud-media',params:{kind:'image',prompt:'test',connectionId:'fixture'}}])},{agent:{session:{id:'owner'}},callId:'once'});
  const done=await jobs[0].done;assert.equal(done.status,'failed');assert.equal(calls,0);assert.equal(runtime.pending().length,0);assert.ok(result.id);
  await tools.get('media_pipeline').execute({action:'create',specJSON:JSON.stringify([{id:'zeroBudget',executor:'cloud-media',params:{kind:'image',prompt:'test',connectionId:'fixture',budgetCNY:0}}])},{agent:{session:{id:'owner'}},callId:'zero-budget'});await jobs[1].done;assert.equal(calls,0);assert.equal(questions,1); // Refused before approval or provider transport.

 }finally{for(const off of effects.reverse())await off?.();runtime.close();fs.rmSync(root,{recursive:true,force:true});}
});
for(const action of ['pause','cancel'])test(action+' arriving during cloud approval leaves original quote unsubmitted even if approval answer arrives',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hybrid-pause31-'));let calls=0;const runtime=new Runtime(root,{vault:{has:()=>true,get:()=> 'fixture-only'},transport:async()=>{calls++;throw Error('must not submit');}}),effects=[],tools=new Map(),jobs=[];
 try{
  const c=runtime.config.load();c.value.connections.push({id:'fixture',providerId:'openai',kind:'image',label:'test',enabled:true,endpoint:'https://example.test/v1',protocol:'openai-image',modelPreview:'fixture',modelQuality:'fixture',voice:'',credentialRef:'stored:test',pricing:{rate:0.1,unit:'request',currency:'CNY',source:'test'}});runtime.config.save(c.value,c.revision);
  let id;
  const ctx={effect:f=>effects.push(f()),tools:{register:t=>{tools.set(t.name,t);return()=>{};}},agents:{get:()=>({session:{id:'owner'}})},jobs:{start:spec=>{const job=spec.run({append(){},updateProgress(){}});jobs.push(job);return 'job';}},userQuestions:{ask:async q=>{
   const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(path.join(root,'pipelines-v3/jobs.sqlite'),{readOnly:true});try{id=db.prepare('SELECT id FROM jobs').get().id;}finally{db.close();}
   await pipeline3(root,{action,id},'owner');return{answers:[{id:q.questions[0].id,selected:['允许本次生成']}]};
  }}};
  await registerNative3(ctx,runtime,x=>x);await tools.get('media_pipeline').execute({action:'create',specJSON:JSON.stringify([{id:'cloud',executor:'cloud-media',params:{kind:'image',prompt:'test',connectionId:'fixture'}}])},{agent:{session:{id:'owner'}},callId:'once'});
  await jobs[0].done;assert.equal(calls,0);const p=await pipeline3(root,{action:'get',id},'owner');assert.equal(p.state,action==='pause'?'paused':'cancelled');assert.ok(p.stages[0].jobId);assert.equal(runtime.row(p.stages[0].jobId,'owner').status,'awaiting-approval');
  assert.equal((await pipeline3(root,{action:'resume',id},'owner')).state,action==='pause'?'paused':'cancelled');
 }finally{for(const off of effects.reverse())await off?.();runtime.close();fs.rmSync(root,{recursive:true,force:true});}
});
