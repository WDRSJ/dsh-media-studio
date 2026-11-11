import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {Readable} from 'node:stream';
import {registerControl3} from '../src/control3.mjs';import {enforce} from '../src/policy3.mjs';import {applyPlanArgs} from '../src/plans3.mjs';
test('v3 settings require trusted UI token; plans affect runtime and do not expose task history',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'control3-'));let handler;
 registerControl3({webServer:{register:r=>{handler=r.handler;return()=>{};}}},root,'token');
 async function request(body,token='token',origin){let status=200,value;const req=Readable.from(body?[JSON.stringify(body)]:[]);req.method=body?'POST':'GET';req.headers={host:'localhost','x-media-token':token,...origin?{origin}:{}};const res={setHeader(){},set statusCode(s){status=s;},end:s=>value=JSON.parse(s)};await handler(req,res);return {status,value};}
 try{
  const state=(await request()).value;assert.equal(state.workflows.length,6);assert.ok(!state.tasks);
  assert.equal((await request({action:'settings',settings:state.settings},'wrong')).status,400);
  assert.equal((await request(null,'token','https://evil.example')).status,400);
  const p={id:'local',name:'本地方案',kind:'image',mode:'Local',tier:'standard',params:{steps:12},budgetCNY:0};
  assert.equal((await request({action:'plan',plan:p})).status,200);
  assert.equal((await request({action:'activatePlan',id:p.id})).status,200);
  assert.throws(()=>enforce(root,'image','cloud','owner','call'),/Local/);
  assert.equal(applyPlanArgs(root,{kind:'image',prompt:'test'}).steps,12);
  await request({action:'activatePlan',id:'',kind:'image'});assert.equal(enforce(root,'image','cloud'),'Auto');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
