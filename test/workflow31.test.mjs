import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {graphToEditor,editorToGraph,graphStructure,modelCatalog,parameterFields} from '../src/workflow-format31.mjs';
import {workflowAdmin} from '../src/workflows3.mjs';
const info={EmptyImage:{input:{required:{width:['INT',{min:16,max:4096}],height:['INT',{min:16,max:4096}],batch_size:['INT',{min:1,max:64}],color:['INT',{min:0,max:0xffffff}]}},output:['IMAGE']},SaveImage:{input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{default:'ComfyUI'}]}},output:[]}};
const graph={'image-A':{class_type:'EmptyImage',inputs:{width:64,height:32,batch_size:1,color:0}},save:{class_type:'SaveImage',inputs:{images:['image-A',0],filename_prefix:'DSH31'}}};
test('API -> editor uses actual slots, portable IDs and topological layout; editor edits round-trip',()=>{
 const original=structuredClone(graph),gui=graphToEditor(graph,info);
 assert.equal(gui.version,0.4);assert.equal(gui.nodes.length,2);assert.equal(gui.links.length,1);assert.ok(gui.nodes[1].pos[0]>gui.nodes[0].pos[0]);
 gui.nodes[0].widgets_values[0]=96;
 const back=editorToGraph(gui,info);assert.equal(back['1'].inputs.width,96);assert.deepEqual(back['2'].inputs.images,['1',0]);assert.deepEqual(original,graph);
 const broken=structuredClone(gui);broken.links[0][4]=99;assert.throws(()=>editorToGraph(broken,info),/连线/);
 const missing=structuredClone(info);delete missing.EmptyImage;assert.throws(()=>graphToEditor(graph,missing),/缺少节点/);
});
test('unknown editor widgets, dangling links, wrong output types and cycles fail closed',()=>{
 assert.throws(()=>graphStructure({x:{class_type:'A',inputs:{image:['missing',0]}}}),/连线/);
 assert.throws(()=>graphStructure({x:{class_type:'A',inputs:{image:['x',0]}}}),/循环/);
 const other=structuredClone(info);other.EmptyImage.output=['LATENT'];assert.throws(()=>graphToEditor(graph,other),/不兼容/);
 const gui=graphToEditor(graph,info);gui.nodes[0].type='UnknownCustom';assert.throws(()=>editorToGraph(gui,{...info,UnknownCustom:info.EmptyImage}),/不能可靠/);
});
test('imports never overwrite, concurrent version conflicts preserve history, restore appends a version',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio31-'));try {
  const first=await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'mine',name:'同名',document:graph,mappings:{width:{node:'image-A',input:'width'}}});assert.equal(first.version,1);
  await assert.rejects(workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'mine',document:graph}),/不会覆盖/);
  await assert.rejects(workflowAdmin(root,{action:'copy',templateId:'mine',id:'mine'}),/禁止覆盖/);
  const second=await workflowAdmin(root,{action:'save',id:'mine',expectedVersion:1,name:'改名',document:first});assert.equal(second.version,2);
  await assert.rejects(workflowAdmin(root,{action:'save',id:'mine',expectedVersion:1,document:first}),/版本冲突/);
  const restored=await workflowAdmin(root,{action:'restore',templateId:'mine',version:1,expectedVersion:2});assert.equal(restored.version,3);assert.equal(restored.name,'同名');
  assert.equal((await workflowAdmin(root,{action:'versions',templateId:'mine'})).length,3);
  const gui={nodes:[{id:'a',type:'Unknown',pos:[1,2],widgets_values:['original']}],links:[],extra:{custom:{unchanged:true}},version:0.4};
  await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'raw',document:gui});assert.deepEqual((await workflowAdmin(root,{action:'exportGUI',templateId:'raw'})).document,gui);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('editor conversion cannot overwrite a version saved while node definitions were loading',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'conflict31-')),old=globalThis.fetch;let release;
 const waiting=new Promise(resolve=>{release=resolve;});globalThis.fetch=async()=>{await waiting;return new Response(JSON.stringify(info));};
 try{
  const t=await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'pending',document:graphToEditor(graph,info)});
  const converting=workflowAdmin(root,{action:'convert',templateId:t.id});
  await workflowAdmin(root,{action:'rename',templateId:t.id,name:'保存期间改名',expectedVersion:1});release();
  await assert.rejects(converting,/版本冲突/);assert.equal((await workflowAdmin(root,{action:'export',templateId:t.id})).name,'保存期间改名');
 }finally{release();globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});
test('server-derived model resources are typed by loader fields, missing metadata stays unknown',()=>{
 const models=modelCatalog({UNETLoader:{input:{required:{unet_name:[['z_image.safetensors']],weight_dtype:[['default']]}}},DualCLIPLoader:{input:{required:{clip_name1:[['qwen.safetensors']],clip_name2:[['clip.safetensors']]}}}},'custom-port');
 assert.equal(models.length,3);assert.equal(models[0].type,'diffusion');assert.equal(models[1].type,'text-encoder');assert.equal(models[0].bytes,null);assert.equal(models[0].license,null);
 const fields=parameterFields(graph,info);assert.equal(fields.find(f=>f.input==='width').max,4096);assert.equal(fields.some(f=>f.input==='images'),false);
});
test('parameter saving validates server ranges and archives original editor before API changes',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio31-')),previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify(info));
 try {
  await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'p',document:{graph,gui:graphToEditor(graph,info)},mappings:{width:{node:'image-A',input:'width'}}});
  await assert.rejects(workflowAdmin(root,{action:'saveParameters',templateId:'p',expectedVersion:1,values:{width:9000}}),/越界/);
  const result=await workflowAdmin(root,{action:'saveParameters',templateId:'p',expectedVersion:1,values:{width:128}});assert.equal(result.version,2);assert.equal(result.graph['image-A'].inputs.width,128);assert.equal(result.gui,null);
  const file=path.join(root,'workflows3/versions/p/1.json');assert.ok(JSON.parse(fs.readFileSync(file)).gui);
 }finally{globalThis.fetch=previous;fs.rmSync(root,{recursive:true,force:true});}
});
