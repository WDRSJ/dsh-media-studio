import {preparation52} from '../src/import-authority52.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {workflowAdmin,workflowTool} from '../src/workflows3.mjs';import {saveSettings3} from '../src/policy3.mjs';
import {recoverableTasks} from '../src/recovery3.mjs';
test('real HTTP connection loss after prompt submission remains uncertain and never resubmits',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lost-response-'));let prompts=0;
 const server=http.createServer((req,res)=>{if(req.url==='/object_info'){res.end(JSON.stringify({EmptyImage:{output:['IMAGE'],input:{required:{width:['INT',{min:1,max:4096}]}}},SaveImage:{output:[],output_node:true,input:{required:{images:['IMAGE',{}],filename_prefix:['STRING',{}]}}}}));}else if(req.url==='/prompt'){prompts++;req.socket.destroy();}else{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{saveSettings3(root,{instances:[{id:'fixture',url:'http://127.0.0.1:'+server.address().port,trusted:true}]});await workflowAdmin(root,{_preparation52:preparation52,action:'import',id:'probe',document:{'1':{class_type:'EmptyImage',inputs:{width:64}},'2':{class_type:'SaveImage',inputs:{images:['1',0],filename_prefix:'test'}}}});const args={action:'submit',templateId:'probe',instanceId:'fixture',requestId:'one'};await assert.rejects(workflowTool(root,args,'owner'),/不确定/);assert.equal((await workflowTool(root,args,'owner')).status,'uncertain');assert.equal(prompts,1);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});}
});

test('provider execution failure survives restart scanning and is not repeatedly reattached',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'failed-restart-')),old=globalThis.fetch,dir=path.join(root,'workflows3/jobs');fs.mkdirSync(dir,{recursive:true});
 try{
  saveSettings3(root,{instances:[{id:'fixture',url:'http://127.0.0.1:18799',trusted:true}]});
  const file=path.join(dir,'failed.json');fs.writeFileSync(file,JSON.stringify({id:'failed',owner:'owner',instance:{id:'fixture',url:'http://127.0.0.1:18799'},promptId:'original',status:'submitted'}));
  globalThis.fetch=async()=>new Response(JSON.stringify({original:{status:{status_str:'error'},outputs:{}}}));
  assert.equal((await workflowTool(root,{action:'poll',id:'failed'},'owner')).status,'failed');assert.equal(JSON.parse(fs.readFileSync(file)).promptId,'original');assert.deepEqual(recoverableTasks(root),[]);
 }finally{globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});
test('poll timeout and offline service preserve the original task for manual recovery',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'poll-recover-')),dir=path.join(root,'workflows3','jobs'),old=globalThis.fetch;fs.mkdirSync(dir,{recursive:true});
 try{saveSettings3(root,{instances:[{id:'fixture',url:'http://127.0.0.1:18799',trusted:true}]});const file=path.join(dir,'task.json'),job={id:'task',owner:'owner',instance:{id:'fixture',url:'http://127.0.0.1:18799'},promptId:'original',status:'submitted'};fs.writeFileSync(file,JSON.stringify(job));
 for(const error of [new DOMException('timeout','TimeoutError'),new Error('offline')]){globalThis.fetch=async()=>{throw error;};await assert.rejects(workflowTool(root,{action:'poll',id:'task'},'owner'));assert.deepEqual(JSON.parse(fs.readFileSync(file)),job);}
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('/history/')?{}:{queue_pending:[[0,'original']],queue_running:[]}));assert.equal((await workflowTool(root,{action:'poll',id:'task'},'owner')).status,'queued');
 }finally{globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});
