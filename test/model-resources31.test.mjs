import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {saveModelMetadata31,resources31,requirements31,editorRequirements31} from '../src/model-resources31.mjs';
test('missing architecture-specific resources stay missing; alternative names do not imply compatibility',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'resources31-'));try {
  const graph={a:{class_type:'UNETLoader',inputs:{unet_name:'missing.safetensors'}},b:{class_type:'MissingCustom',inputs:{}}},info={UNETLoader:{input:{required:{unet_name:[['installed.safetensors']]}}}};
  saveModelMetadata31(root,{instanceId:'one',loader:'UNETLoader',input:'unet_name',name:'missing.safetensors',source:'https://huggingface.co/Comfy-Org/z_image_turbo',license:'unknown',bytes:null,hardware:'not benchmarked'});
  const report=requirements31(root,graph,info,'one');assert.equal(report.ready,false);assert.equal(report.models[0].available,false);assert.equal(report.nodes[1].available,false);assert.equal(report.downloadsPerformed,0);assert.equal(report.models[0].alternatives[0],'installed.safetensors');assert.match(report.models[0].guide[3],/不等于/);
  assert.equal(requirements31(root,graph,info,'other').models[0].source,null);
  assert.equal(resources31(root,info,'one')[0].license,null);
  assert.throws(()=>saveModelMetadata31(root,{instanceId:'one',loader:'A',input:'a',name:'n',source:'https://example.org/model?token=secret'}),/无查询参数/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('nested official editor dependencies can be inspected without pretending proxy widgets were compiled',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'editorrequirements31-'));try{
  const gui={nodes:[{id:1,type:'sub'}],definitions:{subgraphs:[{id:'sub',name:'generic architecture',nodes:[{id:2,type:'UNETLoader',properties:{models:[{name:'missing',url:'https://example.org/public-model',directory:'diffusion_models'}]}}]}]}},info={UNETLoader:{input:{required:{unet_name:[[]]}}}};
  const report=editorRequirements31(root,gui,info,'local');assert.equal(report.ready,false);assert.equal(report.executionGraphAvailable,false);assert.equal(report.models[0].name,'missing');assert.equal(report.models[0].available,false);assert.match(report.limitations[1],/代理控件/);
  gui.definitions.subgraphs[0].nodes.push({id:3,type:'sub'});assert.throws(()=>editorRequirements31(root,gui,info,'local'),/循环/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
