import test from 'node:test';import assert from 'node:assert/strict';import {selectBackend3} from '../src/selection3.mjs';
test('auto selection checks capabilities, quality, memory and strict zero budget',()=>{
 const candidates=[{id:'local',source:'local',kind:'image',tier:'standard',enabled:true,available:true,estimateCNY:0,requiredVRAMMB:8000,capabilities:['txt2img']},{id:'cloud',source:'cloud',kind:'image',tier:'premium',enabled:true,available:true,estimateCNY:1,capabilities:['txt2img','img2img']}];
 assert.equal(selectBackend3(candidates,{kind:'image',availableVRAMMB:9000}).selected.id,'local');
 assert.equal(selectBackend3(candidates,{kind:'image',availableVRAMMB:4000}).selected,null);
 assert.equal(selectBackend3(candidates,{kind:'image',required:['img2img'],budgetCNY:1}).selected.id,'cloud');
 assert.equal(selectBackend3(candidates,{kind:'image',required:['img2img'],budgetCNY:1,allowCloud:false}).selected,null);
});
