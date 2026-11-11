import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {exportPortable31} from '../src/workflow-portable31.mjs';import {workflowAdmin} from '../src/workflows3.mjs';
const t={id:'same',name:'portable',kind:'image',version:7,instanceId:'private-instance',modelBindings:{localPath:'C:/private/model.safetensors'},graph:{a:{class_type:'EmptyImage',inputs:{width:64}}},mappings:{width:{node:'a',input:'width'}}};
test('portable workflow removes instance bindings, imports with fresh identity and never overwrites',async()=>{
 const a=fs.mkdtempSync(path.join(os.tmpdir(),'portable31-a-')),b=fs.mkdtempSync(path.join(os.tmpdir(),'portable31-b-'));try{
  const doc=exportPortable31(t);assert.equal(doc.rebind.required,true);assert.equal(JSON.stringify(doc).includes('private-instance'),false);assert.equal(JSON.stringify(doc).includes('C:/private'),false);
  const first=await workflowAdmin(b,{_preparation52:preparation52,action:'importPortable',document:doc}),second=await workflowAdmin(b,{_preparation52:preparation52,action:'importPortable',document:doc});assert.notEqual(first.id,second.id);assert.equal(first.instanceId,null);assert.deepEqual(first.mappings,t.mappings);assert.equal(first.availability.status,'unchecked');
 }finally{fs.rmSync(a,{recursive:true,force:true});fs.rmSync(b,{recursive:true,force:true});}
});
test('portable export refuses secrets and private absolute paths instead of silently corrupting workflow inputs',()=>{
 for(const inputs of [{api_key:'test-secret'},{image:'C:/Users/private/input.png'},{endpoint:'https://example.org/x?token=test'}])assert.throws(()=>exportPortable31({...t,graph:{a:{class_type:'Unknown',inputs}}}),/凭证|路径|敏感链接/);
});
