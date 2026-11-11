import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {nodePolicy31,nodeReviewRequests31,reviewNode31} from '../src/node-policy31.mjs';
import {analyze} from '../src/workflows3.mjs';
test('custom local node requires explicit review scoped to instance and current definition; cloud nodes never approved',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nodepolicy31-'));try{
  const inst={id:'one',url:'http://127.0.0.1:8191',local:true},info={CustomScale:{input:{required:{factor:['FLOAT',{min:1,max:4}]}},output:[]},CloudPaid:{api_node:true,input:{required:{}},output:[]}},graph={n:{class_type:'CustomScale',inputs:{factor:2}}};
  assert.equal(analyze(graph,info,nodePolicy31(root,inst,info)).compatible,false);
  const req=nodeReviewRequests31(root,inst,graph,info)[0];assert.throws(()=>reviewNode31(root,inst,info,{...req}),/明确确认/);
  reviewNode31(root,inst,info,{...req,acknowledgeLocalOnly:true});assert.equal(analyze(graph,info,nodePolicy31(root,inst,info)).compatible,true);
  assert.equal(nodePolicy31(root,{...inst,id:'two'},info).has('CustomScale'),false);assert.equal(nodePolicy31(root,{...inst,url:'http://127.0.0.1:8192'},info).has('CustomScale'),false);
  const changed=structuredClone(info);changed.CustomScale.input.required.factor[1].max=8;assert.equal(nodePolicy31(root,inst,changed).has('CustomScale'),false);
  assert.throws(()=>reviewNode31(root,inst,info,{node:'CloudPaid',acknowledgeLocalOnly:true}),/云端 API/);
  assert.throws(()=>reviewNode31(root,{...inst,local:false},info,{...req,acknowledgeLocalOnly:true}),/本地实例/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
