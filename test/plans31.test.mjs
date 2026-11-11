import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {workflowAdmin} from '../src/workflows3.mjs';import {storePlan3,activatePlan3,applyPlanArgs,workflowPlanValues31} from '../src/plans3.mjs';
test('dynamic plan parameters bind arbitrary aliases without leaking into cloud args, and fail on mapping changes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'plans31-'));try{
  const graph={x:{class_type:'EmptyImage',inputs:{width:64,height:48,batch_size:1,color:0}}};
  await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'custom',document:graph,mappings:{canvasWidth:{node:'x',input:'width'},batch:{node:'x',input:'batch_size'}}});
  const p=storePlan3(root,{id:'p',name:'generic',kind:'image',mode:'Auto',tier:'preview',workflowId:'custom',params:{width:80},workflowParams:{canvasWidth:96,batch:2}});activatePlan3(root,'p');
  assert.equal(p.workflowVersion,1);assert.deepEqual(workflowPlanValues31(root,p,'custom'),{canvasWidth:96,batch:2});assert.equal(workflowPlanValues31(root,p,'custom',{canvasWidth:112}).canvasWidth,112);
  const args=applyPlanArgs(root,{kind:'image',prompt:'cloud'});assert.equal(args.canvasWidth,undefined);assert.equal(args.batch,undefined);assert.equal(args.width,80);
  assert.throws(()=>storePlan3(root,{...p,workflowParams:{canvasWidth:'wrong'}}),/类型/);
  assert.deepEqual(workflowPlanValues31(root,p,'txt2img',{prompt:'explicit different workflow'}),{prompt:'explicit different workflow'});
  await workflowAdmin(root,{action:'save',id:'custom',expectedVersion:1,document:{graph,mappings:{other:{node:'x',input:'width'}}}});
  assert.throws(()=>workflowPlanValues31(root,p,'custom'),/版本变化/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
