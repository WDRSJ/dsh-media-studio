import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {deriveMappings} from '../src/workflow-auto31.mjs';import {bind} from '../src/workflows3.mjs';
test('prompt and negative never share one text target',()=>{
 const graph={t:{class_type:'CLIPTextEncode',inputs:{text:'prompt',clip:['c',0]}},k:{class_type:'KSampler',inputs:{positive:['t',0],negative:['t',0],seed:1,steps:1,cfg:1,denoise:1,sampler_name:'euler',scheduler:'simple'}},c:{class_type:'CLIPLoader',inputs:{clip_name:'x'}}};
 const {mappings,notes}=deriveMappings(graph,{});
 assert.equal(mappings.prompt.node,'t');assert.equal(mappings.negative,undefined);assert.ok(notes.some(n=>n.kind==='mapping-conflict'));
 const out=bind(graph,{prompt:{node:'t',input:'text'},negative:{node:'t',input:'text'}},{prompt:'positive kept',negative:'negative must not overwrite'});
 assert.equal(out.t.inputs.text,'positive kept');
});
