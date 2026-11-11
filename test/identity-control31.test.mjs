import {simulatedMedia53} from './simulated-media53.mjs';
const pipeline3=(root,args,owner,deps={})=>pipelineCore53(root,args,owner,{verify:simulatedMedia53,...deps});
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{fork}from'node:child_process';import{once}from'node:events';import{DatabaseSync}from'node:sqlite';import{pipeline3 as pipelineCore53}from'../src/pipeline3.mjs';import{workflowIdentity31}from'../src/workflow-identity31.mjs';
test('same-name workflows keep full IDs, versions and definition instance bindings including missing instances',()=>{
 const rows=[{id:'gpuA',label:'同名实例',url:'http://127.0.0.1:8191'},{id:'gpuB',label:'同名实例',url:'https://comfy.example'}],a={id:'same-prefix-first-same-suffix',name:'相同工作流',version:3,instanceId:'gpuA'},b={...a,id:'same-prefix-second-same-suffix',instanceId:'gpuB'};
 const ia=workflowIdentity31(a,rows),ib=workflowIdentity31(b,rows);assert.notEqual(ia.label,ib.label);assert.ok(ia.label.includes(a.id)&&ib.label.includes(b.id));assert.ok(ia.label.includes('v3')&&ia.label.includes('gpuA'));assert.equal(ib.binding.url,rows[1].url);
 assert.match(workflowIdentity31({...a,instanceId:'removed'},rows).label,/未找到/);assert.match(workflowIdentity31({...a,instanceId:null},rows).label,/未绑定/);assert.equal(workflowIdentity31({...a,instanceId:null},rows).binding,null);
});
test('persistent stop cannot be downgraded by pause/continue from another process and carries explicit audit intent',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stop-concurrency31-'));let child;
 try{
  const p=await pipeline3(root,{action:'create',template:'probe'},'owner');child=fork(new URL('./pipeline-control-child31.mjs',import.meta.url),[root,p.id],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});const exited=once(child,'exit');await once(child,'message');await pipeline3(root,{action:'cancel',id:p.id},'owner');await exited;
  for(const action of ['resume','continue','pause'])assert.equal((await pipeline3(root,{action,id:p.id},'owner')).state,'cancelled');
  const view=await pipeline3(root,{action:'get',id:p.id},'owner');assert.equal(view.executionIntent,'stop-after-current-stage');assert.equal(view.stages[0].jobId,undefined);
  const db=new DatabaseSync(path.join(root,'pipelines-v3/jobs.sqlite'),{readOnly:true});try{assert.equal(db.prepare('SELECT paused FROM controls WHERE id=?').get(p.id).paused,2);assert.ok(db.prepare("SELECT * FROM control_events WHERE job_id=? AND intent='stop-after-current-stage'").get(p.id));}finally{db.close();}
 }finally{if(child?.exitCode===null)child.kill();fs.rmSync(root,{recursive:true,force:true});}
});
