import {simulatedMedia53} from './simulated-media53.mjs';
const pipeline3=(root,args,owner,deps={})=>pipelineCore53(root,args,owner,{verify:simulatedMedia53,...deps});
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pipeline3 as pipelineCore53} from '../src/pipeline3.mjs';import {taskAction3} from '../src/taskactions3.mjs';
test('stopping a pipeline prevents future submissions and preserves owner boundary',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stop3-'));let calls=0;
 try{const p=await pipeline3(root,{action:'create',template:'probe'},'owner');await assert.rejects(pipeline3(root,{action:'cancel',id:p.id},'other'),/找不到/);const stopped=await pipeline3(root,{action:'cancel',id:p.id},'owner');assert.equal(stopped.providerCancellationConfirmed,false);const resumed=await pipeline3(root,{action:'resume',id:p.id},'owner',{authorize:()=>{},comfyCall:async()=>{calls++;}});assert.equal(resumed.state,'cancelled');assert.equal(calls,0);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('history actions resolve original owner and refuse absent sessions and traversal',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'task-ui-'));const dir=path.join(root,'workflows3','jobs');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'one.json'),JSON.stringify({owner:'original'}));let invoked;
 try{const ctx={agents:{get:id=>id==='original'?{session:{id}}:null},tools:{get:name=>({execute:async(args,exec)=>{invoked={name,args,owner:exec.agent.session.id};return{status:'running'};}})}};
 await taskAction3(ctx,root,{type:'workflow',id:'one',operation:'query'});assert.deepEqual(invoked,{name:'media_workflow',args:{action:'poll',id:'one'},owner:'original'});
 await assert.rejects(taskAction3(ctx,root,{type:'workflow',id:'../one',operation:'query'}),/无效/);ctx.agents.get=()=>null;await assert.rejects(taskAction3(ctx,root,{type:'workflow',id:'one',operation:'resume'}),/原聊天/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
