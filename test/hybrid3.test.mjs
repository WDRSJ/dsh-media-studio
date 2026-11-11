import {simulatedMedia53} from './simulated-media53.mjs';
const pipeline3=(root,args,owner,deps={})=>pipelineCore53(root,args,owner,{verify:simulatedMedia53,...deps});
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import test from 'node:test';import assert from 'node:assert/strict';import {pipeline3 as pipelineCore53} from '../src/pipeline3.mjs';
test('hybrid cloud output transfers to local stage and recovery never prepares twice',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hybrid3-'));let prepares=0,fail=true;const file=path.join(root,'cloud.png');fs.writeFileSync(file,'fixture-media');
 const options={authorize:()=>{},cloudCall:async a=>a.action==='prepare'?(prepares++,{id:'cloud-job'}):{status:'completed',file,estimateCNY:0.1},encode:async(r,src,dest)=>{if(fail)throw Error('encoder interrupted');fs.copyFileSync(src,dest);}};
 try{
  const p=await pipeline3(root,{action:'create',spec:[{id:'cloud',executor:'cloud-media',params:{kind:'image',connectionId:'configured',prompt:'test'}},{id:'local',executor:'ffmpeg-video',dependencies:['cloud'],params:{seconds:3}}]},'owner');
  await assert.rejects(pipeline3(root,{action:'resume',id:p.id},'owner',options),/interrupted/);
  fail=false;const done=await pipeline3(root,{action:'resume',id:p.id},'owner',options);assert.equal(done.state,'completed');assert.equal(prepares,1);assert.equal(done.stages[0].jobId,'cloud-job');
  assert.equal(done.stages[1].inputs[0].sha256,done.stages[0].output.sha256);
  await assert.rejects(pipeline3(root,{action:'get',id:p.id},'other'),/找不到/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
