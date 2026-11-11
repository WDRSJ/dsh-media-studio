import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ConnectionStore,validateConnections} from '../src/connections.mjs';
import {providersFor} from '../src/catalog.mjs';
const connection=(id,kind)=>({id,providerId:'siliconflow',kind,label:id,enabled:true,endpoint:'',protocol:'',modelPreview:'',modelQuality:'',voice:'',credentialRef:''});
test('empty fields can persist; categories remain independent; stale writes rejected',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-media-config-'));
 try{const s=new ConnectionStore(root),initial=s.load(),v=initial.value;
 v.connections=[connection('img','image'),connection('tts','speech')];v.defaults.image='img';v.defaults.speech='tts';
 const first=s.save(v,initial.revision);assert.equal(first.value.connections[0].endpoint,'');
 assert.throws(()=>s.save(v,initial.revision),/Settings changed/);
 const second=structuredClone(first.value);second.connections[0].modelPreview='new-image';
 const saved=s.save(second,first.revision);assert.equal(saved.value.connections[1].modelPreview,'');
 assert.equal(new ConnectionStore(root).load().value.defaults.speech,'tts');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('custom provider can be stored without credentials; raw keys rejected',()=>{
 const v={schemaVersion:2,customProviders:[{id:'mine',label:'我的服务',kinds:['image']}],connections:[{...connection('custom','image'),providerId:'mine'}],defaults:{image:'custom',speech:null,music:null,video:null}};
 assert.equal(validateConnections(v).connections[0].credentialRef,'');
 assert.equal(providersFor('image',v.customProviders).at(-1).id,'mine');
 v.connections[0].apiKey='should-not-be-stored';assert.throws(()=>validateConnections(v),/Unexpected/);
 delete v.connections[0].apiKey;v.connections[0].endpoint='https://user:secret@example.com';assert.throws(()=>validateConnections(v),/credential-free/);
});
test('invalid routing and unsupported modality cannot cross accounts',()=>{
 const v={schemaVersion:2,customProviders:[],connections:[connection('speech','speech')],defaults:{image:'speech',speech:null,music:null,video:null}};
 assert.throws(()=>validateConnections(v),/default/);v.defaults.image=null;v.connections[0].providerId='bfl';assert.throws(()=>validateConnections(v),/capability/);
});
