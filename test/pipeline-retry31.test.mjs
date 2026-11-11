import {simulatedMedia53} from './simulated-media53.mjs';
const pipeline3=(root,args,owner,deps={})=>pipelineCore53(root,args,owner,{verify:simulatedMedia53,...deps});
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pipeline3 as pipelineCore53} from '../src/pipeline3.mjs';import {cloudParams31,pipelineEstimate31} from '../src/pipeline-billing31.mjs';
test('explicit failed-stage retry keeps previous possible charges, rejects uncertain receipts and serializes competing retry actions',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'retry31-'));let providerStatus='uncertain';try{
  const p=await pipeline3(root,{action:'create',spec:[{id:'cloud',executor:'cloud-media',params:{kind:'image',connectionId:'fixture',prompt:'fixture',budgetCNY:0.2}}]},'owner');
  const options={authorize:()=>{},cloudCall:async a=>a.action==='prepare'?{id:'original'}:a.action==='retry-check'?{status:providerStatus,estimateCNY:0.1}:{status:'failed',estimateCNY:0.1}};
  await assert.rejects(pipeline3(root,{action:'resume',id:p.id},'owner',options),/终止/);await assert.rejects(pipeline3(root,{action:'retry',id:p.id,stageId:'cloud'},'owner',options),/未确认失败/);providerStatus='failed';
  const calls=await Promise.allSettled([pipeline3(root,{action:'retry',id:p.id,stageId:'cloud'},'owner',options),pipeline3(root,{action:'retry',id:p.id,stageId:'cloud'},'owner',options)]);assert.equal(calls.filter(x=>x.status==='fulfilled').length,1);
  const next=await pipeline3(root,{action:'get',id:p.id},'owner');assert.equal(next.stages[0].jobId,undefined);assert.equal(next.stages[0].retryAttempt,1);assert.equal(next.stages[0].attemptHistory[0].jobId,'original');assert.equal(cloudParams31(next.stages[0]).budgetCNY,0.1);assert.equal(pipelineEstimate31(next.stages),null);
  assert.equal(pipelineEstimate31([{...next.stages[0],costCNY:0.1}]),0.2);assert.throws(()=>cloudParams31({...next.stages[0],attemptHistory:[{estimateCNY:null}]}),/费用未知/);
  await pipeline3(root,{action:'cancel',id:p.id},'owner');assert.equal((await pipeline3(root,{action:'retry',id:p.id,stageId:'cloud'},'owner',options)).state,'cancelled');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('a known preflight budget rejection is blocked rather than mislabeled as a provider submission',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'quote-error31-'));try{const p=await pipeline3(root,{action:'create',spec:[{id:'cloud',executor:'cloud-media',params:{kind:'image',connectionId:'fixture',prompt:'fixture',budgetCNY:0}}]},'owner');let prepares=0;const opts={authorize:()=>{},cloudCall:async()=>{prepares++;throw Error('超过本任务预算');}};await assert.rejects(pipeline3(root,{action:'resume',id:p.id},'owner',opts),/预算/);const result=await pipeline3(root,{action:'get',id:p.id},'owner');assert.equal(result.state,'blocked');assert.equal(result.stages[0].state,'blocked');assert.equal(result.stages[0].jobId,undefined);assert.equal(prepares,1);}finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('terminal cloud receipts persist a consistent stage state and resume only the original quote',async()=>{
 for(const status of ['failed','cancelled','uncertain']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'terminal-receipt31-'));try{
   let prepares=0;const ids=[];const opts={authorize:()=>{},cloudCall:async a=>{if(a.action==='prepare'){prepares++;return{id:'original'};}ids.push(a.id);return{status,estimateCNY:0.01};}};
   const p=await pipeline3(root,{action:'create',spec:[{id:'cloud',executor:'cloud-media',params:{kind:'image',connectionId:'fixture',prompt:'fixture'}}]},'owner');
   for(let n=0;n<2;n++){await assert.rejects(pipeline3(root,{action:'resume',id:p.id},'owner',opts),/终止/);const r=await pipeline3(root,{action:'get',id:p.id},'owner');assert.equal(r.stages[0].state,status==='failed'?'blocked':status);assert.equal(r.stages[0].providerStatus,status);assert.equal(r.stages[0].jobId,'original');}
   assert.equal(prepares,1);assert.deepEqual(ids,['original','original']);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 }
});
