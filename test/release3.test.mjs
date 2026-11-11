import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {migrate} from '../src/migrate.mjs';import {Runtime} from '../src/runtime.mjs';import {saveSettings3} from '../src/policy3.mjs';import {autoDecision3} from '../src/auto3.mjs';
test('legacy config without optional history or outputs migrates once and preserves existing destination state',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migrate3-')),legacy=path.join(dir,'old'),root=path.join(dir,'new');fs.mkdirSync(legacy);fs.mkdirSync(root);
 try{const base=JSON.parse(fs.readFileSync(new URL('../assets/default-policy.json',import.meta.url)));const routing={defaults:{image:'ark',video:'ark',music:'minimax',speech:'minimax'},models:base.presets,voices:{}};fs.writeFileSync(path.join(legacy,'media-policy.json'),JSON.stringify(base));fs.writeFileSync(path.join(legacy,'media-routing.json'),JSON.stringify(routing));
 const before=fs.readFileSync(path.join(legacy,'media-policy.json'),'utf8');fs.writeFileSync(path.join(root,'media-policy.json'),JSON.stringify({...base,marker:'preserve-me'}));await migrate(root,legacy);
 const runtime=new Runtime(root);assert.equal(runtime.config.load().value.connections.length,4);runtime.close();assert.equal(JSON.parse(fs.readFileSync(path.join(root,'media-policy.json'))).marker,'preserve-me');assert.equal(fs.readFileSync(path.join(legacy,'media-policy.json'),'utf8'),before);
 const config=fs.readFileSync(path.join(root,'connections.v2.json'),'utf8');await migrate(root,legacy);assert.equal(fs.readFileSync(path.join(root,'connections.v2.json'),'utf8'),config);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('fresh no-Comfy data root supports cloud configuration and Auto refuses absent local capability without network',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'no-comfy3-'));const old=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;throw Error('must not access network');};let runtime;
 try{await migrate(root,null);saveSettings3(root,{mode:'Cloud',instances:[]});runtime=new Runtime(root,{vault:{has:()=>true,get:()=> 'fixture-only'}});const state=runtime.config.load();state.value.connections.push({id:'cloud',providerId:'openai',kind:'image',label:'Cloud only',enabled:true,endpoint:'https://api.openai.com/v1',protocol:'openai-image',modelPreview:'fixture-model',modelQuality:'fixture-model',voice:'',credentialRef:'stored:fixture',pricing:{rate:0,unit:'request',currency:'CNY',source:'fixture'}});runtime.config.save(state.value,state.revision);
 const decision=await autoDecision3(runtime,{kind:'image',prompt:'test',budgetCNY:0},'owner',{discover:async()=>[]});assert.equal(decision.selected.source,'cloud');const plan=runtime.prepare({kind:'image',prompt:'test',connectionId:decision.selected.connectionId},'owner');assert.equal(plan.status,'awaiting-approval');assert.equal(requests,0);
 }finally{runtime?.close();globalThis.fetch=old;fs.rmSync(root,{recursive:true,force:true});}
});


