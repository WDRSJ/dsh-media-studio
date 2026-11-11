import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:8188';
async function call(route,body){
 const response=await fetch(base+route,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,headers:body?{'content-type':'application/json'}:{},signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!response.ok)throw Error('ComfyUI '+route.split('?')[0]+' HTTP '+response.status);
 return response;
}
export function workflow(args){
 const width=Number(args.width??512),height=Number(args.height??512);
 if(![256,512,768].includes(width)||![256,512,768].includes(height))throw Error('画幅必须为 256/512/768');
 const save={class_type:'SaveImage',inputs:{images:['1',0],filename_prefix:'DSH_local'}};
 if(args.template==='probe')return {'1':{class_type:'EmptyImage',inputs:{width,height,batch_size:1,color:0x305477}},'2':save};
 if(!['txt2img','img2img'].includes(args.template)||!args.model||!args.prompt)throw Error('请选择 probe 或 txt2img，并为扩散模板指定 checkpoint 和提示词');
 const graph={'1':{class_type:'VAEDecode',inputs:{samples:['7',0],vae:['3',2]}},'2':save,'3':{class_type:'CheckpointLoaderSimple',inputs:{ckpt_name:args.model}},'4':{class_type:'CLIPTextEncode',inputs:{text:String(args.prompt).slice(0,3000),clip:['3',1]}},'5':{class_type:'CLIPTextEncode',inputs:{text:'',clip:['3',1]}},'6':{class_type:'EmptyLatentImage',inputs:{width,height,batch_size:1}},'7':{class_type:'KSampler',inputs:{model:['3',0],positive:['4',0],negative:['5',0],latent_image:['6',0],steps:16,cfg:6,denoise:1,sampler_name:'euler',scheduler:'normal',seed:42}}};
 if(args.template==='img2img'){if(!/^[^/\\:\x00-\x1f]{1,150}\.(png|jpeg|jpg|webp)$/i.test(args.referenceName||''))throw Error('请指定 ComfyUI input 中的参考图文件名');graph['8']={class_type:'LoadImage',inputs:{image:args.referenceName}};graph['9']={class_type:'ImageScale',inputs:{image:['8',0],upscale_method:'bilinear',width,height,crop:'center'}};graph['6']={class_type:'VAEEncode',inputs:{pixels:['9',0],vae:['3',2]}};graph['7'].inputs.denoise=0.55;}return graph;
}
export async function comfy(root,args,owner){
 const dir=path.join(root,'comfy-jobs');fs.mkdirSync(dir,{recursive:true});if(!owner)throw Error('需要 DSH 会话');
 if(args.action==='status'){const s=await(await call('/system_stats')).json();return {devices:s.devices?.map(x=>({type:x.type,name:x.name})),templates:['probe','txt2img','img2img']};}
 if(args.action==='submit'){const graph=workflow(args);if(args.template!=='probe'){const info=await(await call('/object_info/CheckpointLoaderSimple')).json();if(!info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]?.includes(args.model))throw Error('本机未提供该 checkpoint');}
 const id=randomUUID(),f=path.join(dir,id+'.json'),job={id,owner,graph,templateVersion:1,state:'submitting',created:new Date().toISOString()};fs.writeFileSync(f,JSON.stringify(job),{flag:'wx'});
 try{const v=await(await call('/prompt',{prompt:graph,client_id:id})).json();if(!v.prompt_id)throw Error('服务未返回任务号');job.promptId=v.prompt_id;job.state='submitted';}catch(e){job.state='uncertain';fs.writeFileSync(f,JSON.stringify(job));throw Error('提交状态不明，禁止自动重提；本地编号 '+id);}
 fs.writeFileSync(f,JSON.stringify(job));return {id,state:job.state,promptId:job.promptId};}
 if(!/^[a-f0-9-]{36}$/.test(args.id||''))throw Error('无效的任务编号');const f=path.join(dir,args.id+'.json'),job=JSON.parse(fs.readFileSync(f));if(job.owner!==owner||!job.promptId)throw Error('任务不可访问');
 if(args.action==='cancel'){await call('/queue',{delete:[job.promptId]});return {id:job.id,state:'已请求移除排队项，运行中的任务不会被全局中断'};}
 if(args.action!=='poll')throw Error('操作无效');const history=await(await call('/history/'+encodeURIComponent(job.promptId))).json(),entry=history[job.promptId];if(!entry)return {id:job.id,state:'等待服务历史记录'};
 const img=entry.outputs?.['2']?.images?.[0];if(!img)return {id:job.id,state:entry.status?.status_str||'无图片'};const file=path.join(dir,job.id+'.png');
 if(!fs.existsSync(file)){const bytes=Buffer.from(await(await call('/view?'+new URLSearchParams({filename:img.filename,type:'output',subfolder:img.subfolder||''}))).arrayBuffer());if(bytes.length>64*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('输出不是有效 PNG');fs.writeFileSync(file,bytes);}
 return {id:job.id,state:'completed',file,promptId:job.promptId};}
