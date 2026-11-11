import fs from'node:fs';import path from'node:path';import{DatabaseSync}from'node:sqlite';
// Read-only reference audit. Never opens credential stores or media files.
export function instanceReferences31(root,id){
 const references=[],errors=[];let count=0;
 const visit=(v,where)=>{if(!v||typeof v!=='object')return;if(v.instanceId===id||v.instance?.id===id)references.push({source:where});for(const [k,x]of Object.entries(v))if(k!=='instance'&&x&&typeof x==='object')visit(x,where+'/'+k);};
 const read=(f,where)=>{try{if(++count>10000)throw Error('引用文件超过安全扫描上限');const st=fs.lstatSync(f);if(st.isSymbolicLink()||st.size>32*1024*1024)throw Error('引用文件类型或大小不能安全检查');const value=JSON.parse(fs.readFileSync(f,'utf8'));visit(value,where);if(id==='local'&&where.startsWith('comfy-jobs/')&&!value.instance&&!value.instanceId)references.push({source:where+'/legacy-default-local'});}catch(e){errors.push({source:where,error:e.message});}};
 for(const f of ['resource-archives49.json','studio3-plans.json','pipeline-presets31.json','model-resource-metadata31.json','node-reviews31.json','workflows3/templates.json'])if(fs.existsSync(path.join(root,f)))read(path.join(root,f),f);
 const walk=(relative)=>{const dir=path.join(root,relative);if(!fs.existsSync(dir))return;if(fs.lstatSync(dir).isSymbolicLink()){errors.push({source:relative,error:'引用根目录含符号链接，未遍历目标'});return;}for(const e of fs.readdirSync(dir,{withFileTypes:true})){const r=relative+'/'+e.name;if(e.isSymbolicLink()){errors.push({source:r,error:'引用目录含符号链接'});continue;}if(e.isDirectory())walk(r);else if(e.name.endsWith('.json'))read(path.join(root,r),r);}};
 for(const dir of ['workflows3/versions','workflows3/jobs','comfy-jobs','auto-plans31'])walk(dir);
 for(const [f,table]of [['pipelines-v3/jobs.sqlite','jobs'],['tasks.sqlite','tasks']])if(fs.existsSync(path.join(root,f))){let db;try{db=new DatabaseSync(path.join(root,f),{readOnly:true});for(const row of db.prepare('SELECT id,plan FROM '+table).all())visit(JSON.parse(row.plan),f+'/'+row.id);}catch(e){errors.push({source:f,error:e.message});}finally{db?.close();}}
 return{references,errors,removable:references.length===0&&errors.length===0};
}
export function instanceLabel31(i){let address;try{address=new URL(i.url||i.address).host;}catch{address='地址待配置';}return[String(i.label||'').trim()||'ComfyUI',address,'ID '+i.id].join(' · ');}
export function instanceSummary31(settings){return settings.instances.map(i=>({...i,displayLabel:instanceLabel31(i),duplicates:settings.instances.filter(x=>x.id!==i.id&&x.url===i.url).map(x=>x.id)}));}
