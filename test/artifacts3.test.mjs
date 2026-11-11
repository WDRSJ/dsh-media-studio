import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {registerNative3} from '../src/native3.mjs';
test('completed local artifacts retain the same signed route after plugin restart',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stable-artifact-'));const dir=path.join(root,'workflows3','jobs');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'image.png');fs.writeFileSync(file,'fixture');fs.writeFileSync(path.join(dir,'job.json'),JSON.stringify({status:'completed',files:[{path:file}]}));
 async function load(){const routes=[],effects=[];await registerNative3({effect:f=>effects.push(f()),tools:{register:()=>()=>{}},webServer:{register:r=>{routes.push(r);return()=>{};}}},{root},x=>x);for(const off of effects.reverse())await off?.();return routes;}
 try{const a=await load(),b=await load();assert.equal(a.length,1);assert.equal(a[0].path,b[0].path);assert.match(a[0].path,/local-artifact\/[a-f0-9]{64}$/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
