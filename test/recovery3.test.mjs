import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {recoverableTasks} from '../src/recovery3.mjs';
import {DatabaseSync} from 'node:sqlite';
test('restart scan preserves owners, excludes uncertain submissions and tolerates damaged records',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'recovery3-'));
 try {
  assert.deepEqual(recoverableTasks(root),[]);
  const dir=path.join(root,'workflows3','jobs');fs.mkdirSync(dir,{recursive:true});
  for(const [id,status,promptId] of [['a','submitted','p'],['b','uncertain','p'],['c','submitted',null],['d','completed','p']])fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({id,owner:'session',status,promptId}));
  fs.writeFileSync(path.join(dir,'broken.json'),'{');
  fs.mkdirSync(path.join(root,'pipelines-v3'));
  const db=new DatabaseSync(path.join(root,'pipelines-v3','jobs.sqlite'));
  db.exec('CREATE TABLE jobs(id TEXT,owner TEXT,call_id TEXT,plan TEXT)');
  for(const [id,state] of [['safe','waiting'],['unsafe','uncertain']])db.prepare('INSERT INTO jobs VALUES(?,?,?,?)').run(id,'owner','call',JSON.stringify({state:'waiting',stages:[{state}]}));db.close();
  assert.deepEqual(recoverableTasks(root),[{type:'workflow',id:'a',owner:'session'},{type:'pipeline',id:'safe',owner:'owner',call:'call'}]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('native registration reattaches persisted work only for a loaded session and disposes safely',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-host-')),effects=[],started=[];
 try {
  const dir=path.join(root,'workflows3','jobs');fs.mkdirSync(dir,{recursive:true});
  for(const owner of ['loaded','absent'])fs.writeFileSync(path.join(dir,owner+'.json'),JSON.stringify({id:owner,owner,promptId:'existing',status:'submitted'}));
  const {registerNative3}=await import('../src/native3.mjs');
  const ctx={effect:f=>effects.push(f()),tools:{register:()=>()=>{}},agents:{get:owner=>owner==='loaded'?{}:null},jobs:{start:spec=>{started.push(spec);return 'background-id';}}};
  await registerNative3(ctx,{root},x=>x);
  assert.equal(started.length,1);assert.equal(started[0].owner,'loaded');
  for(const off of effects.reverse())await off?.();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
