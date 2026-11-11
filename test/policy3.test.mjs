import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Runtime} from '../src/runtime.mjs';
import {saveSettings3,loadSettings3,modeFor,enforce} from '../src/policy3.mjs';
test('Local rejects cloud before credential access and after an approved task changes mode',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'policy3-'));let network=0;
 const runtime=new Runtime(root,{transport:async()=>{network++;throw Error('unexpected');},vault:{has:()=>true,get:()=>'fake'}});
 try{const s=loadSettings3(root);saveSettings3(root,{...s,mode:'Local'});
 assert.throws(()=>runtime.prepare({kind:'image',prompt:'a'},'user','call'),/Local/);
 runtime.db.prepare('INSERT INTO tasks(id,owner,created,plan,status) VALUES(?,?,?,?,?)').run('old','user',new Date().toISOString(),JSON.stringify({input:{kind:'image'},estimate:.1}),'approved');
 await assert.rejects(runtime.submit('old','user'),/Local/);assert.equal(network,0);assert.equal(runtime.row('old','user').status,'approved');
 }finally{runtime.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('mode order, persistence, trusted instance validation and Cloud generation boundary',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'policy-modes-'));try{saveSettings3(root,{mode:'Cloud',kinds:{image:'Hybrid'},sessions:{writer:'Local'},tasks:{'writer/first':'Auto'}});
 const s=loadSettings3(root);assert.equal(modeFor(s,'image','writer','first'),'Auto');assert.equal(modeFor(s,'video','writer','second'),'Local');assert.equal(modeFor(s,'image','other','a'),'Hybrid');assert.throws(()=>enforce(root,'video','local','other','a'),/Cloud/);assert.throws(()=>saveSettings3(root,{instances:[{id:'x',url:'http://example.com',trusted:true}]}),/HTTPS/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
