import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {mediaDeliveries} from '../src/delivery3.mjs';
test('native file delivery uses official event, scopes archives and deduplicates after reload',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'delivery3-')),events=[],file=path.join(root,'output.png');fs.writeFileSync(file,'test-owned');
 try{const session={snapshotEvents:()=>events,append:(type,data)=>events.push({type,data})},agent={session},ctx={agents:{get:id=>id==='owner'?agent:null,turnBoundaryOf:()=>({lastTurn:3})}};
  const value={status:'completed',files:[{path:file},{path:process.execPath}]};
  assert.equal(mediaDeliveries(ctx,root)(value,'other','one'),false);
  assert.equal(mediaDeliveries(ctx,root)(value,'owner','one'),true);
  assert.equal(mediaDeliveries(ctx,root)(value,'owner','one'),true);
  assert.deepEqual(events,[{type:'deliverables/presented',data:{turn:3,callId:'media-delivery:one',files:[{path:file,description:'output.png'}]}}]);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('first-turn delivery waits for scoped official wake and is disposed with the plugin',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'delivery3-')),events=[],file=path.join(root,'output.png');fs.writeFileSync(file,'test-owned');let listener,removed=0,cleanup;
 try{const session={snapshotEvents:()=>events,append:(type,data)=>events.push({type,data})},agent={session,ctx:{on:(name,f)=>{assert.equal(name,'agent/pre-step');listener=f;return()=>removed++;}}},ctx={effect:f=>cleanup=f(),agents:{get:()=>agent,turnBoundaryOf:()=>({lastTurn:0})}};
  const deliver=mediaDeliveries(ctx,root),value={status:'completed',files:[{path:file}]};deliver(value,'owner','one');deliver(value,'owner','one');assert.equal(events.length,0);let continued=false;listener({turn:1},()=>{continued=true;});assert.equal(events[0].data.turn,1);assert.equal(continued,true);assert.equal(removed,1);cleanup();
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
