import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import{Readable}from'node:stream';import{registerControl3}from'../src/control3.mjs';
test('pipeline UI validates without execution and respects original session tool availability and origin protection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pipeline-ui31-'));let handler,calls=0;
 const agent={session:{id:'owner',meta:{title:'isolated'}},ctx:{tools:{get:()=>undefined}}};const ctx={webServer:{register:route=>{handler=route.handler;return()=>{};}},agents:{list:()=>[agent],get:id=>id==='owner'?agent:null},tools:{get:()=>({execute:async()=>{calls++;return{id:'should-not-fallback'};}})}};
 registerControl3(ctx,root,'fixture-token');const post=async(body,origin='http://localhost')=>{const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.headers={host:'localhost',origin,'x-media-token':'fixture-token'};let text='';const res={statusCode:200,setHeader(){},end:value=>{text=value;}};await handler(req,res);return{status:res.statusCode,data:JSON.parse(text)};};
 try{
  const spec=[{id:'source',executor:'comfy-workflow',params:{kind:'image',templateId:'probe',values:{}}}];
  assert.equal((await post({action:'pipelineValidate',spec})).data.result.executed,false);assert.equal(calls,0);
  const request={action:'pipelineCreate',owner:'owner',requestId:'ui-11111111-1111-4111-8111-111111111111',spec};assert.match((await post(request)).data.error,/未启用/);assert.equal(calls,0);
  agent.ctx.tools.get=()=>({execute:async(args,context)=>{calls++;assert.equal(context.agent,agent);assert.equal(context.callId,request.requestId);return{id:'original',state:'pending'};}});
  assert.equal((await post(request)).data.result.id,'original');assert.equal(calls,1);
  assert.equal((await post(request,'https://external.invalid')).status,400);assert.equal(calls,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
