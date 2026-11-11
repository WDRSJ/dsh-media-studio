import {verifyMedia53} from './media-verify53.mjs';
import {withResourceLock49,assertNotArchived49} from './resource-journal49.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { comfy } from './comfy.mjs';
import {cloudParams31,previousCost31} from './pipeline-billing31.mjs';
import {studioImage31} from './input31.mjs';
import {synthesizeWindowsTTS} from './tts-win31.mjs';
import {synthesizeNeuralTTS} from './neural-tts31.mjs';

const run = promisify(execFile);
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const uuid = /^[a-f0-9-]{36}$/;
const namePattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,48}$/;
const inflight = new Set();
const specFingerprint=stages=>createHash('sha256').update(JSON.stringify(stages.map(({id,executor,dependencies,params})=>({id,executor,dependencies,params})))).digest('hex');
const mediaKind=stage=>['comfy-image','archive-image'].includes(stage?.executor)?'image':['comfy-workflow','cloud-media'].includes(stage?.executor)?stage.params.kind:stage?.executor==='windows-tts'||stage?.executor==='neural-tts'?'speech':['ffmpeg-video','ffmpeg-compose'].includes(stage?.executor)?'video':null;
const mediaInputKind=stage=>{const kind=mediaKind(stage);return kind==='music'||kind==='speech'?'audio':kind;};

export function validatePipeline(spec) {
  if (!Array.isArray(spec) || spec.length < 1 || spec.length > 12) throw Error('编排需要 1 至 12 个阶段');
  const names = new Set();
  return spec.map(stage => {
    if (!namePattern.test(stage.id) || names.has(stage.id)) throw Error('阶段名称无效或重复');
    const params = stage.params || {};
    const deps = stage.dependencies || [];
    if (!Array.isArray(deps) || deps.some(d => !names.has(d))) throw Error('依赖必须引用排在前面的阶段');
    const predecessor = spec.find(s => s.id === deps[0]);
    const imageSource=s=>['comfy-image','archive-image'].includes(s?.executor)||['cloud-media','comfy-workflow'].includes(s?.executor)&&s.params?.kind==='image';
    if(stage.executor==='archive-image'){
      if(deps.length||typeof params.reference!=='string'||!(/^(?:\$input|studio:\/\/(?:workflow|pipeline)\/[\w-]{1,100}\/[\w-]{1,100})$/.test(params.reference)))throw Error('归档图片阶段需要本会话素材标识或Auto输入占位符');
    }else if (stage.executor === 'comfy-image') {
      if (deps.length || !['txt2img','probe'].includes(params.template || 'txt2img')) throw Error('图片阶段只支持本地文生图或探针');
      if ((params.template || 'txt2img') === 'txt2img' && (!params.prompt || !params.model)) throw Error('需要提示词和 checkpoint');
    } else if(stage.executor==='comfy-workflow'){
      if(!['image','video','music','speech'].includes(params.kind)||!/^[\w.-]{1,100}$/.test(params.templateId||'')||!/^[\w.-]{1,100}$/.test(params.instanceId||'local'))throw Error('工作流阶段需要类别、工作流与实例');
      if(params.workflowVersion!==undefined&&(!Number.isInteger(params.workflowVersion)||params.workflowVersion<1))throw Error('工作流阶段版本无效');
      const values=params.values||{},inputs=params.inputMappings||{};
      if(!values||Array.isArray(values)||typeof values!=='object'||JSON.stringify(values).length>12000||Object.entries(values).some(([k,v])=>!/^\w{1,100}$/.test(k)||!['string','boolean','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)))throw Error('工作流阶段参数无效');
      if(!inputs||Array.isArray(inputs)||typeof inputs!=='object'||Object.entries(inputs).some(([alias,id])=>!/^\w{1,100}$/.test(alias)||!deps.includes(id)||!mediaInputKind(spec.find(s=>s.id===id)))||deps.some(id=>!Object.values(inputs).includes(id))||Object.keys(inputs).some(k=>Object.hasOwn(values,k)))throw Error('工作流素材依赖或参数映射无效');
    } else if(stage.executor==='neural-tts'){
      const text=typeof params.text==='string'?params.text.trim():'';
      if(deps.length||!text||text.length>2000)throw Error('神经语音阶段需要 1–2000 字符文本且不能依赖其他阶段');
      if(params.voice!==undefined&&(typeof params.voice!=='string'||params.voice.length>100))throw Error('神经语音 voice 参数无效');
      if(params.language!==undefined&&(typeof params.language!=='string'||!/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(params.language)))throw Error('神经语音 language 参数无效');
      if(params.rate!==undefined&&(!Number.isFinite(params.rate)||params.rate< -2||params.rate>2))throw Error('神经语音 rate 需为 -2–2');
    } else if(stage.executor==='windows-tts'){
      if(process.platform!=='win32')throw Error('Windows 本地 TTS 仅支持 Windows');
      const text=typeof params.text==='string'?params.text.trim():'';
      if(deps.length||!text||text.length>800)throw Error('本地语音阶段需要 1–800 字符文本且不能依赖其他阶段');
      if(params.voice!==undefined&&(typeof params.voice!=='string'||params.voice.length>100))throw Error('本地语音 voice 参数无效');
      if(params.language!==undefined&&(typeof params.language!=='string'||!/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(params.language)))throw Error('本地语音 language 参数无效');
      if(params.rate!==undefined&&(!Number.isInteger(params.rate)||params.rate< -10||params.rate>10))throw Error('本地语音 rate 需为 -10–10 整数');
    } else if(stage.executor==='cloud-media'){
      if(deps.length>1||deps.length===1&&!imageSource(predecessor)||!['image','speech','music','video'].includes(params.kind)||!params.connectionId||!params.prompt)throw Error('云端阶段需要类别、连接和内容');
      if(params.resolution!==undefined&&(typeof params.resolution!=='string'||!/^[\w.x-]{1,30}$/.test(params.resolution))||params.generateAudio!==undefined&&typeof params.generateAudio!=='boolean'||params.instrumental!==undefined&&typeof params.instrumental!=='boolean'||params.lyrics!==undefined&&(typeof params.lyrics!=='string'||params.lyrics.length>3500))throw Error('云端阶段输出或音频参数无效');
      if(params.expectedWireHash!==undefined&&!/^[a-f0-9]{64}$/.test(params.expectedWireHash))throw Error('阶段请求绑定哈希无效');
      if(params.expectedConnectionHash!==undefined&&!/^[a-f0-9]{64}$/.test(params.expectedConnectionHash))throw Error('阶段账号绑定哈希无效');
      if(params.duration!==undefined&&(!Number.isFinite(params.duration)||params.duration<=0||params.duration>600)||params.ratio!==undefined&&!['16:9','9:16','1:1','4:3','3:4','21:9'].includes(params.ratio))throw Error('云端阶段时长或画幅无效');
      if(params.budgetCNY!==undefined&&(!Number.isFinite(params.budgetCNY)||params.budgetCNY<0||params.budgetCNY>100))throw Error('云端阶段预算无效');
    } else if (stage.executor === 'ffmpeg-video') {
      if (deps.length !== 1 || !imageSource(predecessor)) throw Error('视频阶段必须引用一项图片输出');
      if (![3,4,5,6,7,8,9,10].includes(params.seconds ?? 5)) throw Error('视频时长范围 3–10 秒');
    } else if(stage.executor==='ffmpeg-compose'){
      const roles=params.roles;
      if(!roles||Array.isArray(roles)||typeof roles!=='object'||Object.keys(roles).some(k=>!['video','speech','music'].includes(k))||!roles.video||!roles.speech&&!roles.music||params.replaceAudio!==true)throw Error('合成需视频及语音/音乐输入，并明确选择替换原声');
      if(new Set(deps).size!==deps.length||Object.values(roles).some(id=>!deps.includes(id))||deps.some(id=>!Object.values(roles).includes(id)))throw Error('合成输入依赖不完整');
      for(const [kind,id]of Object.entries(roles))if(mediaKind(spec.find(s=>s.id===id))!==kind)throw Error('合成素材类型不匹配 '+kind);
      for(const gain of [params.speechGain??1,params.musicGain??0.2])if(!Number.isFinite(gain)||gain<0||gain>2)throw Error('音轨音量范围0–2');
    } else throw Error('执行器未纳入编排；不执行未知或收费阶段');
    names.add(stage.id);
    return {id:stage.id,name:typeof stage.name==='string'?stage.name.slice(0,100):stage.id,executor:stage.executor,dependencies:[...deps],params:
      stage.executor==='archive-image'?{reference:params.reference}:stage.executor==='windows-tts'?{text:String(params.text).slice(0,800),voice:params.voice||'',language:params.language||'',rate:params.rate??0}:stage.executor==='neural-tts'?{text:String(params.text).slice(0,2000),voice:params.voice||'',language:params.language||'zh-CN',rate:params.rate??0}:stage.executor==='ffmpeg-compose'?{roles:{...params.roles},replaceAudio:true,speechGain:params.speechGain??1,musicGain:params.musicGain??0.2}:stage.executor==='comfy-workflow'?{kind:params.kind,templateId:params.templateId,instanceId:params.instanceId||'local',values:structuredClone(params.values||{}),inputMappings:{...params.inputMappings},...params.workflowVersion!==undefined?{workflowVersion:params.workflowVersion}:{}}:stage.executor==='cloud-media'?{kind:params.kind,connectionId:params.connectionId,prompt:String(params.prompt).slice(0,5000),tier:params.tier||'preview',...Object.fromEntries(['resolution','generateAudio','instrumental','lyrics'].filter(k=>params[k]!==undefined).map(k=>[k,params[k]])),...params.expectedWireHash?{expectedWireHash:params.expectedWireHash}:{},...params.expectedConnectionHash?{expectedConnectionHash:params.expectedConnectionHash}:{},...params.duration!==undefined?{duration:params.duration}:{},...params.ratio!==undefined?{ratio:params.ratio}:{},...params.budgetCNY!==undefined?{budgetCNY:params.budgetCNY}:{}}:stage.executor === 'comfy-image' ? {template:params.template || 'txt2img',model:String(params.model||'').slice(0,200),prompt:String(params.prompt||'').slice(0,3000),width:params.width??512,height:params.height??512,instanceId:params.instanceId||'local',templateId:params.templateId||'txt2img'} : {seconds:params.seconds??5},
      state:'pending',costCNY:stage.executor==='cloud-media'?null:0,retryPolicy:['ffmpeg-video','ffmpeg-compose'].includes(stage.executor)?'local-render-only':'original-receipt-only'};
  });
}

async function encodeVideo(root, source, target, seconds) {
  const binary = process.env.DSH_FFMPEG_PATH || path.join(root,'tools','ffmpeg.exe');
  const temp = target+'.working.mp4';
  await run(binary,['-nostdin','-y','-v','error','-loop','1','-framerate','24','-i',source,'-t',String(seconds),
    '-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2,fade=t=in:d=0.35,fade=t=out:st='+(seconds-0.5)+':d=0.5',
    '-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',temp],{windowsHide:true,timeout:90000});
  fs.renameSync(temp,target);
}

export async function composeMedia31(root,inputs,target,params){
 const binary=process.env.DSH_FFMPEG_PATH||path.join(root,'tools','ffmpeg.exe'),temp=target+'.working.mp4';
 const args=['-nostdin','-y','-v','error','-i',inputs.video.file],filters=[],labels=[];let index=1;
 for(const role of ['speech','music'])if(inputs[role]){
  if(role==='music')args.push('-stream_loop','-1');args.push('-i',inputs[role].file);
  filters.push('['+index+++':a:0]volume='+params[role+'Gain']+'['+role+']');labels.push('['+role+']');
 }
 filters.push(labels.join('')+(labels.length>1?'amix=inputs='+labels.length+':duration=longest:normalize=0,':'')+'apad[mixed]');
 await run(binary,[...args,'-filter_complex',filters.join(';'),'-map','0:v:0','-map','[mixed]','-c:v','copy','-c:a','aac','-shortest','-movflags','+faststart',temp],{windowsHide:true,timeout:180000,maxBuffer:1024*1024});
 fs.renameSync(temp,target);
}

async function archived(file,kind,root,verify) {
  if (!fs.statSync(file).size) throw Error('输出文件为空');
  return {kind,file,sha256:digest(file),verification:await verify(root,file,['music','speech'].includes(kind)?'audio':kind)};
}

export async function pipeline3(root,args,owner,{authorize,comfyCall=comfy,cloudCall,encode=encodeVideo,compose=composeMedia31,verify=verifyMedia53}={}) {
  if (!owner) throw Error('需要 DSH 会话');
  const folder=path.join(root,'pipelines-v3');
  fs.mkdirSync(folder,{recursive:true});
  const db=new DatabaseSync(path.join(folder,'jobs.sqlite'));
  db.exec('PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,call_id TEXT,plan TEXT NOT NULL,worker INTEGER,UNIQUE(owner,call_id));CREATE TABLE IF NOT EXISTS controls(id TEXT PRIMARY KEY,owner TEXT NOT NULL,paused INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS control_events(job_id TEXT,owner TEXT,intent TEXT,created TEXT);');
  try {
    if(args.action==='create') {
      const stages=validatePipeline(args.spec || [{id:'illustration',executor:'comfy-image',params:{template:args.template||'txt2img',prompt:args.prompt,model:args.model,instanceId:args.instanceId,templateId:args.templateId}},
        {id:'clip',executor:'ffmpeg-video',dependencies:['illustration'],params:{seconds:args.seconds??5}}]);
      const id=randomUUID(), plan={id,created:new Date().toISOString(),stages,state:'pending',specFingerprint:specFingerprint(stages)};
      withResourceLock49(root,()=>{for(const stage of stages){if(stage.params.templateId)assertNotArchived49(root,'workflow',stage.params.templateId);if(stage.params.connectionId)assertNotArchived49(root,'account',stage.params.connectionId);}db.prepare('INSERT OR IGNORE INTO jobs VALUES(?,?,?,?,NULL)').run(id,owner,args.callId||null,JSON.stringify(plan));});
      if(!args.callId)return plan;
      const prior=JSON.parse(db.prepare('SELECT plan FROM jobs WHERE owner=? AND call_id=?').get(owner,args.callId).plan);
      if((prior.specFingerprint||specFingerprint(prior.stages))!==plan.specFingerprint)throw Error('重复请求标识对应不同阶段，拒绝隐式替换或重新提交');
      return prior;
    }
    if(!uuid.test(args.id)) throw Error('无效任务编号');
    const row=db.prepare('SELECT * FROM jobs WHERE id=? AND owner=?').get(args.id,owner);
    if(!row) throw Error('找不到本会话的任务');
    const plan=JSON.parse(row.plan);
    const control=()=>db.prepare('SELECT paused FROM controls WHERE id=? AND owner=?').get(plan.id,owner)?.paused||0;
    const setControl=value=>{
      db.exec('BEGIN IMMEDIATE');try{
        if(value===0)db.prepare('UPDATE controls SET paused=0 WHERE id=? AND owner=? AND paused=1').run(plan.id,owner);
        else db.prepare('INSERT INTO controls(id,owner,paused) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET paused=MAX(controls.paused,excluded.paused) WHERE owner=excluded.owner').run(plan.id,owner,value);
        const actual=control();db.prepare('INSERT INTO control_events VALUES(?,?,?,?)').run(plan.id,owner,actual===2?'stop-after-current-stage':actual===1?'pause-after-current-stage':'continue',new Date().toISOString());db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    };
    const halted=()=>control()!==0,haltState=()=>control()===2?'cancelled':'paused';
    const workerAlive=()=>{if(!row.worker)return false;try{process.kill(row.worker,0);return true;}catch(error){return error.code!=='ESRCH';}};
    const view=()=>{const value=control(),intent=value===2?'stop-after-current-stage':value===1?'pause-after-current-stage':null;
      return {...plan,executionIntent:intent,...!['completed','cancelled'].includes(plan.state)&&value?{state:value===2?(workerAlive()?'cancel-requested':'cancelled'):(workerAlive()?'pause-requested':'paused'),providerCancellationConfirmed:false,message:(value===2?'已记录停止后续请求':'已记录暂停后续请求')+'；当前已提交阶段不承诺撤回，也不会自动重提'}:{}};
    };
    if(plan.state==='completed'){for(const stage of plan.stages){const out=stage.output;if(!out?.file||!fs.existsSync(out.file)||digest(out.file)!==out.sha256)throw Error('历史产物已变化，不能交付');if(!out.verification?.verified)out.verification=await verify(root,out.file,['music','speech'].includes(out.kind)?'audio':out.kind);if(['music','speech'].includes(out.kind)&&out.purposeEvidence?.purpose!==out.kind&&!out.verification?.simulated)throw Error('旧任务用途待审查，保留原记录；不能凭音频容器交付为'+out.kind);}db.prepare('UPDATE jobs SET plan=? WHERE id=? AND owner=?').run(JSON.stringify(plan),plan.id,owner);}
    if(args.action==='get') return view();
    if(args.action==='pause'){
      if(['completed','cancelled'].includes(plan.state))return plan;
      if(control()===2)return view();
      setControl(1);return view();
    }
    if(args.action==='continue'){
      if(control()===2||plan.state==='cancelled')return view();
      setControl(0);args={...args,action:'resume'};
    }
    if(args.action==='cancel'){
      if(['completed','cancelled'].includes(plan.state))return plan;
      // 2 is a durable stop request. It cannot be downgraded to pause/continue.
      setControl(2);
      // An abnormal exit bypasses the runner's finally block. Reclaim only a
      // demonstrably dead process, using CAS so a new runner cannot be cleared.
      if(row.worker&&!inflight.has(plan.id)){
        try{process.kill(row.worker,0);}catch(e){
          if(e.code!=='ESRCH')throw e;
          const cleared=db.prepare('UPDATE jobs SET worker=NULL WHERE id=? AND owner=? AND worker=?').run(plan.id,owner,row.worker);
          if(cleared.changes)row.worker=null;
        }
      }
      if(inflight.has(plan.id)||row.worker)return view();
      plan.state='cancelled';plan.message='已停止后续阶段；已提交供应商的任务可能继续执行，未确认供应商撤回';plan.providerCancellationConfirmed=false;
      const changed=db.prepare('UPDATE jobs SET plan=? WHERE id=? AND owner=? AND worker IS NULL').run(JSON.stringify(plan),plan.id,owner);if(!changed.changes)return{...JSON.parse(row.plan),busy:true,message:'阶段正在启动，请稍后重试'};return plan;
    }
    if(plan.state==='cancelled')return plan;
    if(args.action==='retry'){
      if(halted())throw Error('暂停或停止意图仍有效；不能通过重试清除');
      const target=plan.stages.find(s=>s.id===args.stageId);if(plan.state!=='blocked'||!target||target.executor!=='cloud-media'||!target.jobId||target.output)throw Error('只能显式重试被供应商确认失败的云端阶段');
      if(row.worker||inflight.has(plan.id))throw Error('原阶段仍在运行，请先核对原任务');
      const check=await cloudCall?.({action:'retry-check',id:target.jobId},owner);if(check?.status!=='failed'||!Number.isFinite(check.estimateCNY))throw Error('供应商未确认失败或费用未知，禁止新请求；请核对原回执');
      db.exec('BEGIN IMMEDIATE');try{
        const latest=db.prepare('SELECT plan,worker FROM jobs WHERE id=? AND owner=?').get(plan.id,owner),current=JSON.parse(latest.plan),stage=current.stages.find(s=>s.id===args.stageId);
        if(halted()||latest.worker||current.state!=='blocked'||stage.jobId!==target.jobId)throw Error('原任务状态已变化，未重试');
        stage.attemptHistory=[...(stage.attemptHistory||[]),{jobId:stage.jobId,status:'failed',estimateCNY:check.estimateCNY,mayBeBilled:true,at:new Date().toISOString()}];previousCost31(stage);cloudParams31(stage);
        stage.retryAttempt=(stage.retryAttempt||0)+1;delete stage.jobId;delete stage.promptId;delete stage.error;delete stage.providerStatus;stage.costCNY=null;stage.state='pending';current.state='pending';delete current.error;
        db.prepare('UPDATE jobs SET plan=? WHERE id=? AND owner=? AND worker IS NULL').run(JSON.stringify(current),plan.id,owner);db.exec('COMMIT');return current;
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
    if(args.action!=='resume') throw Error('操作无效');
    if(halted())return view();
    if(inflight.has(plan.id)) return {...plan,busy:true};
    if(row.worker && row.worker!==process.pid) {
      try {process.kill(row.worker,0);return {...plan,busy:true};} catch(e){if(e.code!=='ESRCH')throw e;}
    }
    const taken=db.prepare('UPDATE jobs SET worker=? WHERE id=? AND worker IS ?').run(process.pid,plan.id,row.worker);
    if(!taken.changes)return {...plan,busy:true};
    inflight.add(plan.id);
    const persist=()=>db.prepare('UPDATE jobs SET plan=? WHERE id=?').run(JSON.stringify(plan),plan.id);
    const claimStart=(stage,phase)=>{
      db.exec('BEGIN IMMEDIATE');try{
        if(halted()){plan.state=haltState();persist();db.exec('COMMIT');return false;}
        stage.state=phase;if(phase==='rendering')stage.attempts=(stage.attempts||0)+1;persist();db.exec('COMMIT');return true;
      }catch(error){db.exec('ROLLBACK');throw error;}
    };
    let activeStage;
    try {
      if(typeof authorize!=='function')throw Error('执行策略未绑定，拒绝运行');
      const dir=path.join(folder,plan.id);fs.mkdirSync(dir,{recursive:true});
      for(const stage of plan.stages){
        activeStage=stage;
        if(halted()){plan.state=haltState();persist();return plan;}
        if(stage.state==='completed'){
          if (!fs.existsSync(stage.output.file)||digest(stage.output.file)!==stage.output.sha256)throw Error('已归档输出丢失或变化，拒绝静默重跑');
          continue;
        }
        await authorize({executor:stage.executor,kind:['cloud-media','comfy-workflow'].includes(stage.executor)?stage.params.kind:['comfy-image','archive-image'].includes(stage.executor)?'image':stage.executor==='windows-tts'||stage.executor==='neural-tts'?'speech':'video',source:stage.executor==='cloud-media'?'cloud':'local'});
        if(halted()){plan.state=haltState();persist();return plan;}
        plan.state='running';delete plan.error;
        if(stage.executor==='archive-image'){
          const source=studioImage31(root,stage.params.reference,owner);if(!source)throw Error('归档图片输入尚未绑定，不接受外部路径或地址');const file=path.join(dir,stage.id+path.extname(source.file));fs.copyFileSync(source.file,file);stage.output=await archived(file,'image',root,verify);stage.inputs=[{reference:source.reference,sha256:source.sha256}];
        }else if(stage.executor==='cloud-media'){
          if(typeof cloudCall!=='function')throw Error('云端执行器未绑定');
          const requestId=plan.id+':'+stage.id+(stage.retryAttempt?':retry:'+stage.retryAttempt:'');
          if(!stage.jobId&&['preparing','submitting','uncertain'].includes(stage.state)){
            const input=stage.dependencies.length?plan.stages.find(s=>s.id===stage.dependencies[0]).output:null;
            if(input&&(!fs.existsSync(input.file)||digest(input.file)!==input.sha256))throw Error('输入归档校验失败');
            const prior=await cloudCall({action:'reconcile',params:cloudParams31(stage),requestId,input},owner);
            if(!prior?.id){stage.state='uncertain';throw Error('原云端阶段缺少可核对报价，禁止重提');}stage.jobId=prior.id;stage.state='waiting';persist();
          }
          if(!stage.jobId){
            if(!claimStart(stage,'preparing'))return view();
            const input=stage.dependencies.length?plan.stages.find(s=>s.id===stage.dependencies[0]).output:null;
            if(input&&(!fs.existsSync(input.file)||digest(input.file)!==input.sha256))throw Error('输入归档校验失败');
            if(input)stage.inputs=[{stage:stage.dependencies[0],sha256:input.sha256}];
            const r=await cloudCall({action:'prepare',params:cloudParams31(stage),requestId,input},owner);
            if(!r.id)throw Error('云端计划未返回编号');stage.jobId=r.id;stage.state='waiting';persist();
          }
          const r=await cloudCall({action:'resume',id:stage.jobId,previousAttempts:stage.attemptHistory||[],canContinue:()=>!halted()},owner);stage.providerStatus=r.status;
          if(r.status==='failed')stage.costCNY=r.estimateCNY??null;
          if(r.status==='paused'){plan.state=haltState();persist();return plan;}
          if(r.status!=='completed'){
            if(['failed','cancelled','uncertain'].includes(r.status)){
              stage.state=r.status==='failed'?'blocked':r.status;
              throw Error('云端阶段终止：'+({failed:'供应商已报告失败',cancelled:'已取消',uncertain:'提交回执不确定，禁止重提'}[r.status]));
            }
            plan.state='waiting';persist();return plan;
          }
          if(!r.file)throw Error('云端成品未归档');
          const file=path.join(dir,stage.id+path.extname(r.file));fs.copyFileSync(r.file,file);stage.output=await archived(file,stage.params.kind,root,verify);if(r.purposeEvidence)stage.output.purposeEvidence=r.purposeEvidence;stage.costCNY=r.estimateCNY??null;
        }else if(['comfy-image','comfy-workflow'].includes(stage.executor)){
          if(!stage.jobId&&stage.executor==='comfy-workflow'&&['submitting','uncertain'].includes(stage.state)){
            // Read-only lookup of the deterministic original plugin receipt.
            // No new submit is permitted here, including when receipt is absent.
            const prior=await comfyCall(root,{...stage.params,action:'reconcile',requestId:plan.id+':'+stage.id},owner);
            if(!prior?.id||!prior.promptId)throw Error('原本地阶段缺少可核对回执，禁止重提');
            stage.jobId=prior.id;stage.promptId=prior.promptId;stage.state='waiting';persist();
          }
          if(!stage.jobId){
            if(stage.state==='submitting'||stage.state==='uncertain')throw Error('上次提交结果不明，请人工核对，禁止重提');
            const inputs={};for(const [alias,sourceId]of Object.entries(stage.params.inputMappings||{})){const input=plan.stages.find(s=>s.id===sourceId).output;const kind=input?.kind==='music'||input?.kind==='speech'?'audio':input?.kind;if(!input||!['image','video','audio'].includes(kind)||!input.verification?.verified||!fs.existsSync(input.file)||digest(input.file)!==input.sha256)throw Error('工作流输入归档校验失败');inputs[alias]={...input,kind,reference:'studio://pipeline/'+plan.id+'/'+sourceId};}
            stage.inputs=Object.entries(inputs).map(([alias,input])=>({alias,stage:stage.params.inputMappings[alias],sha256:input.sha256}));if(!claimStart(stage,'submitting'))return view();
            const response=await comfyCall(root,{...stage.params,action:'submit',requestId:plan.id+':'+stage.id,canContinue:()=>!halted(),...stage.executor==='comfy-workflow'?{inputs,workflow:true}:{}},owner);
            if(response.preflightFailure){stage.state='blocked';throw Error(response.error||'执行前检查失败，未提交');}
            if(response.paused){stage.state='pending';plan.state=haltState();persist();return plan;}
            if(!response.id)throw Error('提交未获得可恢复任务编号');
            stage.jobId=response.id;stage.promptId=response.promptId;stage.state='waiting';persist();
          }
          const result=await comfyCall(root,{action:'poll',id:stage.jobId,kind:stage.params.kind||'image'},owner);
          if(!result.file){
            if(['error','failed','cancelled','无图片'].includes(result.state))throw Error('原 Comfy 任务终止：'+result.state);
            plan.state='waiting';persist();return plan;
          }
          const file=path.join(dir,stage.id+(stage.executor==='comfy-image'?'.png':path.extname(result.file)));fs.copyFileSync(result.file,file);
          stage.output=await archived(file,stage.params.kind||'image',root,verify);if(result.files?.[0]?.purposeEvidence)stage.output.purposeEvidence=result.files[0].purposeEvidence;
        } else if(stage.executor==='neural-tts'){
          const r=await synthesizeNeuralTTS(root,{...stage.params});
          const file=path.join(dir,stage.id+'.wav');fs.copyFileSync(r.file,file);fs.rmSync(r.file,{force:true});
          stage.output=await archived(file,'speech',root,verify);stage.output.purposeEvidence=r.purposeEvidence;stage.output.voice=r.voice;stage.output.language=r.language;stage.output.sha256=r.sha256;
        } else if(stage.executor==='windows-tts'){
          const r=await synthesizeWindowsTTS(root,{...stage.params});
          const file=path.join(dir,stage.id+'.wav');fs.copyFileSync(r.file,file);fs.rmSync(r.file,{force:true});
          stage.output=await archived(file,'speech',root,verify);stage.output.purposeEvidence=r.purposeEvidence;stage.output.voice=r.voice;stage.output.language=r.language;stage.output.sha256=r.sha256;
        } else if(stage.executor==='ffmpeg-compose'){
          const inputs={};for(const [role,id]of Object.entries(stage.params.roles)){const input=plan.stages.find(s=>s.id===id).output;if(!input||input.kind!==role||!fs.existsSync(input.file)||digest(input.file)!==input.sha256)throw Error('合成输入归档校验失败');if(role!=='video'&&input.purposeEvidence?.purpose!==role&&!input.verification?.simulated)throw Error('音轨用途尚未验证：'+role+'，一般音频不能直接当作音乐或语音');inputs[role]=input;}
          stage.inputs=Object.entries(inputs).map(([role,input])=>({role,stage:stage.params.roles[role],sha256:input.sha256}));if(!claimStart(stage,'rendering'))return view();
          const file=path.join(dir,stage.id+'.mp4');await compose(root,inputs,file,stage.params);stage.output=await archived(file,'video',root,verify);
        } else {
          const src=plan.stages.find(s=>s.id===stage.dependencies[0]).output;
          stage.inputs=[{stage:stage.dependencies[0],sha256:src.sha256}];if(!claimStart(stage,'rendering'))return view();
          const file=path.join(dir,stage.id+'.mp4');await encode(root,src.file,file,stage.params.seconds);
          stage.output=await archived(file,'video',root,verify);
        }
        stage.state='completed';delete stage.error;persist();
      }
      plan.state='completed';persist();return plan;
    }catch(e){const stage=activeStage||plan.stages.find(s=>s.state!=='completed');
      if(e.definitive&&stage)stage.state='blocked';
      if(stage){stage.error=e.message;stage.failedAt=new Date().toISOString();}
      if(stage?.state==='submitting')stage.state='uncertain';
      if(stage?.executor==='cloud-media'&&stage.state==='preparing')stage.state='blocked';
      plan.state=stage?.state==='uncertain'?'uncertain':'blocked';plan.error=e.message;persist();throw e;
    }finally{inflight.delete(plan.id);db.prepare('UPDATE jobs SET worker=NULL WHERE id=?').run(plan.id);}
  }finally{db.close();}
}
