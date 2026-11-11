import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {workflowAdmin,workflowTool,analyze,bind} from '../src/workflows3.mjs';
import {loadSettings3,saveSettings3} from '../src/policy3.mjs';
const fixture=()=>fs.mkdtempSync(path.join(os.tmpdir(),'workflow3-'));
test('workflow imports preserve GUI graph without pretending it is executable; versions and built-in switches persist',async()=>{
 const root=fixture();try{
  const gui={nodes:[{id:1,type:'Example'}],links:[]};await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'gui',document:gui});
  await assert.rejects(workflowTool(root,{action:'submit',templateId:'gui'},'owner'),/API/);
  assert.deepEqual((await workflowAdmin(root,{action:'export',templateId:'gui'})).gui,gui);
  await workflowAdmin(root,{action:'enable',templateId:'txt2img',enabled:false});
  assert.equal((await workflowAdmin(root,{action:'list'})).templates.find(t=>t.id==='txt2img').enabled,false);
  await workflowAdmin(root,{action:'enable',templateId:'txt2img',enabled:true});
  assert.equal((await workflowAdmin(root,{action:'export',templateId:'txt2img'})).version,3);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('untrusted remote configuration can be saved but is never invoked; missing mappings and unknown nodes fail closed',async()=>{
 const root=fixture();let calls=0;const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('unexpected network');};
 try{saveSettings3(root,{...loadSettings3(root),instances:[{id:'remote',url:'https://example.com',trusted:false}]});
  await assert.rejects(workflowTool(root,{action:'submit',templateId:'txt2img',instanceId:'remote',allowRemote:true},'owner'),/远程/);assert.equal(calls,0);
  assert.throws(()=>bind({'1':{class_type:'EmptyImage',inputs:{width:512}}},{},{width:768}),/映射/);
  const verdict=analyze({'1':{class_type:'PaidCloudNode',inputs:{}}},{PaidCloudNode:{input:{required:{}}}});assert.equal(verdict.compatible,false);
  assert.equal(analyze({'1':{class_type:'EmptyImage',inputs:{width:'999999999'}}},{EmptyImage:{output:['IMAGE'],input:{required:{width:['INT',{min:1,max:8192}]}}},SaveImage:{output:[],output_node:true,input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{}]}}}}).compatible,false);
 }finally{globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});
test('submit idempotency, ambiguous transport and owner isolation never repeat network submit',async()=>{
 const root=fixture();let submits=0;const old=globalThis.fetch;
 const graph={'1':{class_type:'EmptyImage',inputs:{width:512}},'2':{class_type:'SaveImage',inputs:{images:['1',0],filename_prefix:'fixture'}}};
 globalThis.fetch=async url=>{if(String(url).endsWith('/object_info'))return new Response(JSON.stringify({EmptyImage:{output:['IMAGE'],input:{required:{width:['INT',{min:1,max:8192}]}}},SaveImage:{output:[],output_node:true,input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{}]}}}}));submits++;throw Error('connection lost after send');};
 try{await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'probe',document:graph});
  const a={action:'submit',templateId:'probe',requestId:'same'};
  await assert.rejects(workflowTool(root,a,'owner'),/不确定/);
  const again=await workflowTool(root,a,'owner');assert.equal(again.status,'uncertain');assert.equal(submits,1);
  await assert.rejects(workflowTool(root,{action:'poll',id:again.id},'another'),/不存在/);
 }finally{globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});
import {convertGUI} from '../src/workflows3.mjs';
test('GUI conversion preserves explicit links and refuses ambiguous widget layouts',()=>{
 const info={EmptyImage:{output:['IMAGE'],input:{required:{width:['INT',{}],height:['INT',{}],batch_size:['INT',{}],color:['INT',{}]}}},SaveImage:{output:[],input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{}]}}}};
 const gui={nodes:[{id:1,type:'EmptyImage',widgets_values:[512,512,1,0]},{id:2,type:'SaveImage',inputs:[{name:'images',link:7}],widgets_values:['test']}],links:[[7,1,0,2,0,'IMAGE']]};
 const graph=convertGUI(gui,info);assert.deepEqual(graph['2'].inputs.images,['1',0]);assert.equal(graph['1'].inputs.width,512);
 gui.nodes[0].widgets_values.push('unknown-control');assert.throws(()=>convertGUI(gui,info),/数量不匹配/);
 gui.nodes[0].type='CloudPaid';assert.throws(()=>convertGUI(gui,info),/不能可靠转换/);
});
