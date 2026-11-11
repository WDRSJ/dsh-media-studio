import test from 'node:test';import assert from 'node:assert/strict';import{workflow}from'../src/comfy.mjs';import{validateConnections}from'../src/connections.mjs';
test('bounded Comfy templates reject paths and produce an edit graph with fixed output and model inputs',()=>{
 assert.throws(()=>workflow({template:'img2img',prompt:'x',model:'m',referenceName:'../bad.png'}));assert.throws(()=>workflow({template:'probe',width:8192}));
 const g=workflow({template:'img2img',model:'m',prompt:'x',referenceName:'allowed.png'});assert.equal(g['6'].class_type,'VAEEncode');assert.equal(g['2'].class_type,'SaveImage');
});
test('tier routes cannot select an absent connection',()=>{assert.throws(()=>validateConnections({schemaVersion:2,customProviders:[],connections:[],defaults:{music:null,image:null,speech:null,video:null},tierRoutes:{image:{premium:'absent'}}}));});
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{Runtime}from'../src/runtime.mjs';
test('billing confirmation stays separate from reservation and cannot overwrite an accepted bill',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-test-')),runtime=new Runtime(root);try{const plan={input:{kind:'image',prompt:'test'},connection:{providerId:'fixture',label:'fixture'},model:'test',estimate:.5};runtime.db.prepare('INSERT INTO tasks(id,owner,created,plan,status) VALUES(?,?,?,?,?)').run('receipt-test','o',new Date().toISOString(),JSON.stringify(plan),'completed');
 assert.throws(()=>runtime.reconcile('receipt-test','other',.2,'fixture'));const view=runtime.reconcile('receipt-test','o',.2,'fixture');assert.equal(view.billing.settledCNY,.2);assert.equal(view.billing.estimateCNY,.5);assert.throws(()=>runtime.reconcile('receipt-test','o',.1,'fixture'));}finally{runtime.close();fs.rmSync(root,{recursive:true,force:true});}
});
