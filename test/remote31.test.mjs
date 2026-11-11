import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {saveSettings3,loadSettings3} from '../src/policy3.mjs';import {workflowAdmin,workflowTool} from '../src/workflows3.mjs';import {registerNative3} from '../src/native3.mjs';
test('remote metadata requires explicit trust/permission, safe references and drops auth on endpoint change',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'remote31-')),old=globalThis.fetch;let calls=0;process.env.MEDIA31_TEST_BEARER='fake-isolated-only';
 globalThis.fetch=async(url,args)=>{calls++;assert.equal(args.headers.authorization,'Bearer fake-isolated-only');assert.equal(args.redirect,'error');return new Response(JSON.stringify({}));};
 try{
  saveSettings3(root,{...loadSettings3(root),instances:[{id:'r',url:'https://example.invalid',trusted:false,credentialRef:'env:MEDIA31_TEST_BEARER'}]});
  await assert.rejects(workflowAdmin(root,{action:'catalog',instanceId:'r',allowRemote:true}),/远程/);assert.equal(calls,0);
  saveSettings3(root,{...loadSettings3(root),instances:loadSettings3(root).instances.map(i=>({...i,trusted:true}))});
  await assert.rejects(workflowAdmin(root,{action:'catalog',instanceId:'r'}),/远程/);assert.equal(calls,0);
  await workflowAdmin(root,{action:'catalog',instanceId:'r',allowRemote:true});assert.equal(calls,1);
  saveSettings3(root,{...loadSettings3(root),instances:[{...loadSettings3(root).instances[0],url:'https://other.invalid',trusted:true}]});
  const changed=loadSettings3(root).instances[0];assert.equal(changed.credentialRef,'');assert.equal(changed.trusted,false);
  assert.throws(()=>saveSettings3(root,{instances:[{id:'r',url:'https://example.invalid',credentialRef:'plaintext-secret'}]}),/安全引用/);
 }finally{globalThis.fetch=old;delete process.env.MEDIA31_TEST_BEARER;fs.rmSync(root,{recursive:true,force:true});}
});
test('native remote execution declined in original session makes zero provider requests',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'remote-native31-')),effects=[],registered=new Map(),old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
 try{
  saveSettings3(root,{...loadSettings3(root),mode:'Local',instances:[{id:'r',url:'https://example.invalid',trusted:true}]});
  await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'w',document:{a:{class_type:'EmptyImage',inputs:{width:64}}}});
  const agent={session:{id:'owner'}},ctx={effect:f=>effects.push(f()),tools:{register:t=>{registered.set(t.name,t);return()=>{};}},agents:{get:()=>agent},userQuestions:{ask:async()=>({answers:[{id:'remote-comfy',selected:['取消']}]})}};
  await registerNative3(ctx,{root},x=>x);
  await assert.rejects(registered.get('media_workflow').execute({action:'submit',templateId:'w',instanceId:'r'}, {agent,callId:'remote-test'}),/取消远程/);assert.equal(calls,0);
 }finally{for(const off of effects.reverse())await off?.();globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});
