import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {parameterFields} from '../src/workflow-format31.mjs';import {requirements31} from '../src/model-resources31.mjs';import {bind,workflowAdmin} from '../src/workflows3.mjs';import {storePlan3,activatePlan3} from '../src/plans3.mjs';import {autoDecision3} from '../src/auto3.mjs';
test('multi-loader initialization keeps missing resources explicit including numbered CLIP slots; no checkpoint substitution',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'setup31-'));try{
  const graph={u:{class_type:'UNETLoader',inputs:{unet_name:'missing'}},c:{class_type:'DualCLIPLoader',inputs:{clip_name1:'text-a',clip_name2:'missing-text'}},v:{class_type:'VAELoader',inputs:{vae_name:'vae'}}};
  const info={UNETLoader:{input:{required:{unet_name:[['unet']]}}},DualCLIPLoader:{input:{required:{clip_name1:[['text-a','text-b']],clip_name2:[['text-a','text-b']]}}},VAELoader:{input:{required:{vae_name:[['vae']]}}}};
  const fields=parameterFields(graph,info);assert.equal(fields.length,4);assert.ok(fields.every(f=>f.resource));assert.equal(fields.find(f=>f.input==='clip_name2').default,'missing-text');assert.equal(requirements31(root,graph,info,'one').ready,false);
  const mapping={diffusion:{node:'u',input:'unet_name'},encoder2:{node:'c',input:'clip_name2'}},values={diffusion:'unet',encoder2:'text-b'};const bound=bind(graph,mapping,values);
  assert.equal(requirements31(root,bound,info,'one').ready,true);assert.equal(graph.u.inputs.unet_name,'missing');assert.equal(bound.c.inputs.clip_name1,'text-a');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('initialization rejects saving a stale workflow inspection instead of silently binding a newer version',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'setup-version31-'));try{
  const graph={a:{class_type:'EmptyImage',inputs:{width:64}}};await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'workflow',document:graph,mappings:{width:{node:'a',input:'width'}}});
  const input={id:'p',name:'初始化',kind:'image',mode:'Local',tier:'preview',workflowId:'workflow',workflowParams:{width:80},expectedWorkflowVersion:1};assert.equal(storePlan3(root,input).workflowVersion,1);
  await workflowAdmin(root,{action:'save',id:'workflow',expectedVersion:1,document:{graph,mappings:{width:{node:'a',input:'width'}}}});
  assert.throws(()=>storePlan3(root,input),/版本变化/);assert.equal(storePlan3(root,{...input,expectedWorkflowVersion:2}).workflowVersion,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('saved initialization plan zero ceiling constrains Auto even when request allows a higher budget',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'setup-auto31-'));try{
  const p=storePlan3(root,{id:'p',name:'零费用',kind:'image',mode:'Auto',tier:'preview',budgetCNY:0});activatePlan3(root,p.id);
  const runtime={root,vault:{has:()=>true},config:{load:()=>({value:{connections:[{id:'voice',endpoint:'https://fixture.invalid/v1',kind:'image',enabled:true,protocol:'openai-image',modelPreview:'voice',credentialRef:'fixture',pricing:{currency:'CNY',rate:0.01,unit:'request'}}]}})}};
  const d=await autoDecision3(runtime,{kind:'image',prompt:'not submitted',budgetCNY:1},'owner',{discover:async()=>[]});assert.equal(d.budgetCNY,0);assert.equal(d.selected,null);assert.equal(d.rejected[0].reason,'超过预算');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
