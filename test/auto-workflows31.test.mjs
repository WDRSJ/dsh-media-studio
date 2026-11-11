import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {autoDecision3} from '../src/auto3.mjs';import {workflowAdmin} from '../src/workflows3.mjs';import {storePlan3,activatePlan3} from '../src/plans3.mjs';
test('Auto enumerates saved Auto workflows using their own bindings, tier and instance; explicit active workflow prevents silent fallback',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'auto-workflows31-'));try{
  const graph={a:{class_type:'EmptyImage',inputs:{width:64,height:48,batch_size:1,color:0}},b:{class_type:'SaveImage',inputs:{images:['a',0],filename_prefix:'test'}}};
  await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'custom',document:graph,mappings:{width:{node:'a',input:'width'}}});
  const base={name:'Auto model-free fixture',kind:'image',mode:'Auto',tier:'premium',workflowId:'custom',params:{},workflowParams:{width:96},budgetCNY:0};
  storePlan3(root,{...base,id:'other-instance',instanceId:'offline'});storePlan3(root,{...base,id:'chosen',instanceId:'local'});
  const runtime={root,config:{load:()=>({value:{connections:[]}})}},checked=[];
  const options={discover:async()=>[{id:'local',local:true,available:true,devices:[{type:'cpu'}]}],inspect:async a=>{checked.push(a);return{compatible:true,issues:[]};}};
  const d=await autoDecision3(runtime,{kind:'image',prompt:'test',tier:'standard',width:128,budgetCNY:0},'owner',options);
  assert.equal(d.selected.planId,'chosen');assert.equal(d.selected.workflowId,'custom');assert.equal(d.selected.values.width,128);assert.equal(d.selected.workflowVersion,1);assert.equal(checked.length,1);assert.match(d.selected.qualityEvidence,/非客观质量/);
  activatePlan3(root,'other-instance');assert.equal((await autoDecision3(runtime,{kind:'image',prompt:'test'},'owner',options)).selected,null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Auto excludes workflows requiring external input rather than using saved image filenames,',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'auto-input31-'));try{
  const runtime={root,config:{load:()=>({value:{connections:[]}})}};storePlan3(root,{id:'input',name:'Input fixture',kind:'image',mode:'Auto',tier:'preview',workflowId:'upscale',workflowParams:{image:'old-user-file.png'}});
  const options={discover:async()=>[{id:'local',local:true,available:true}],inspect:async()=>{throw Error('Input workflow must be rejected before probing');}};
  const d=await autoDecision3(runtime,{kind:'image',prompt:'test'},'owner',options);assert.equal(d.selected,null);assert.match(d.rejected[0].reason,/不能复用历史素材/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
