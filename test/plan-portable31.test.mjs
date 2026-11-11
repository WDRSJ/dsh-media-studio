import {preparation52} from '../src/import-authority52.mjs';
import {previewImport51,finishImport51} from '../src/import-session51.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {workflowAdmin} from '../src/workflows3.mjs';import {storePlan3,plans3} from '../src/plans3.mjs';import {exportPlan31,importPlan31} from '../src/plan-portable31.mjs';
test('cross-device plan creates independent workflow and inactive draft without credentials or machine bindings',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-plan31-')),a=path.join(root,'a'),b=path.join(root,'b');fs.mkdirSync(a);fs.mkdirSync(b);
 try{
  await workflowAdmin(a,{_preparation52:preparation52,action:'import',id:'original',document:{n:{class_type:'EmptyImage',inputs:{width:64,height:48}}},mappings:{canvasWidth:{node:'n',input:'width'}}});
  storePlan3(a,{id:'source',name:'portable',kind:'image',mode:'Local',tier:'preview',workflowId:'original',instanceId:'machine-a',workflowParams:{canvasWidth:96}});
  const packet=await exportPlan31(a,'source'),serialized=JSON.stringify(packet);assert.ok(!serialized.includes('machine-a'));assert.ok(!serialized.includes('original'));assert.equal(packet.containsCredentials,false);
  const preview=await previewImport51(b,packet);assert.deepEqual(fs.readdirSync(b),[]);const committed=await finishImport51(b,{previewId:preview.previewId}),result={draft:committed.plan,activated:committed.activated},draft=result.draft;assert.notEqual(draft.workflowId,'original');assert.equal(draft.instanceId,'');assert.equal(draft.connectionId,'');assert.equal(result.activated,false);assert.equal(plans3(b).plans.length,1);
  assert.throws(()=>storePlan3(b,draft),/重新选择/);const saved=storePlan3(b,{...draft,instanceId:'machine-b'});assert.equal(saved.workflowParams.canvasWidth,96);assert.deepEqual(plans3(b).active,{});
  const bad=structuredClone(packet);bad.plan.workflowParams.canvasWidth='C:\\private\\file';await assert.rejects(importPlan31(b,bad),/绝对路径/);
  bad.plan.workflowParams={api_key:'private-test-only'};await assert.rejects(importPlan31(b,bad),/凭证/);
  const conflict=structuredClone(packet);conflict.plan.kind='video';await assert.rejects(importPlan31(b,conflict),/类别不符/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
