import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {z} from 'zod';
import {jsonRequest,requestBytes,validateURL,publicIP,outputDownloadURL} from './network.mjs';
import {getKey,hasKey} from './keys.mjs';
import {adapters,adapterFor,adapterPresets} from './adapters/index.mjs';
import {readRouting,presetKey as routePresetKey,choices} from './routing.mjs';
import {tencentRequest,TENCENT_ENDPOINT} from './tencent.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const inputSchema=z.object({
  kind:z.enum(['image','video','speech','music']),tier:z.enum(['preview','quality']).default('preview'),
  prompt:z.string().min(1).max(5000),provider:z.enum(['default','ark','minimax','bailian','tencent',...adapters.keys()]).default('default'),
  duration:z.number().int().min(4).max(15).default(5),ratio:z.enum(['16:9','9:16','1:1','4:3','3:4','21:9']).default('16:9'),
  generateAudio:z.boolean().default(false),voiceId:z.string().min(1).max(150).regex(/^(?=.*\S)[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u,'Voice ID must contain printable characters without controls or line breaks').default('male-qn-qingse'),
  lyrics:z.string().max(3500).default(''),instrumental:z.boolean().default(true),
  referenceImages:z.array(z.string().url().max(4000)).max(4).default([])
}).strict();
const priceSchema=z.object({model:z.string().regex(/^[a-zA-Z0-9_./-]{1,150}$/),unit:z.enum(['image','video_second','speech_kchar','music_request','video_request']),unitPriceCNY:z.number().finite().nonnegative().nullable(),priceSource:z.string().nullable(),priceCheckedAt:z.string().nullable()}).strict();
const tencentPreset={model:'MiniMaxMusic-3.0',unit:'music_request',unitPriceCNY:1.2,priceSource:'https://cloud.tencent.com/document/product/862/36180',priceCheckedAt:'2026-10-29T00:00:00Z'};
const minimaxVideoPresets={preview:{model:'MiniMax-H3-Lite',unit:'video_second',unitPriceCNY:0.2,priceSource:'https://platform.minimax.cn/docs/pricing/overview',priceCheckedAt:'2026-10-29T00:00:00Z'},quality:{model:'MiniMax-H3',unit:'video_second',unitPriceCNY:0.6,priceSource:'https://platform.minimax.cn/docs/pricing/overview',priceCheckedAt:'2026-10-29T00:00:00Z'}};
const tierSchema=z.object({preview:priceSchema,quality:priceSchema}).strict();
export const policySchema=z.object({schemaVersion:z.literal(1),paidGenerationEnabled:z.boolean(),monthlyBudgetCNY:z.number().finite().nonnegative(),perRequestBudgetCNY:z.number().finite().nonnegative(),approvalHours:z.number().int().min(1).max(24),minimaxMusicEligible:z.boolean(),bailianMusicEligible:z.boolean(),bailianWorkspaceId:z.string().regex(/^[a-zA-Z0-9-]{1,100}$/).nullable(),tencentMusicEligible:z.boolean().default(false),presets:z.object({...Object.fromEntries(['image','video','speech','music','bailianMusic'].map(k=>[k,tierSchema])),tencentMusic:tierSchema.default({preview:tencentPreset,quality:tencentPreset}),minimaxVideo:tierSchema.default(minimaxVideoPresets),...Object.fromEntries(Object.entries(adapterPresets).map(([key,value])=>[key,tierSchema.default(value)]))}).strict()}).strict();
const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)||typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const month=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
const money=x=>Math.ceil(x*10000)/10000;
const now=()=>new Date().toISOString();
// MiniMax official TTS billing: each Han character counts as two billing
// characters; letters, punctuation, spaces, newlines and other code points as one.
export function speechBillingCharacters(text){return Array.from(text).reduce((sum,char)=>sum+(/\p{Script=Han}/u.test(char)?2:1),0);}
export function outputFormat(bytes,kind){
  if(bytes.length<16)throw Error('Output is too short to be media');
  if(kind==='image'){
    if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
    if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
    if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'webp';
  }else if(kind==='video'){
    if(bytes.subarray(4,8).toString()==='ftyp')return 'mp4';
  }else{
    if(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224))return 'mp3';
    if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE')return 'wav';
  }
  throw Error('Output media signature is invalid; retained submission, no automatic regeneration');
}
// Pure request construction shared by preview and execution. No database,
// credentials, files or network are accessed by this function.
export function buildMediaPlan(raw,p,routing){
  routing=structuredClone(routing);
    const input=inputSchema.parse(raw);const selected=input.provider==='default'?routing.defaults[input.kind]:input.provider;routePresetKey(input.kind,selected);if(input.provider==='default')input.provider=selected;if(input.kind==='speech'&&raw.voiceId===undefined){const voice=routing.voices[selected]||'alex';input.voiceId=selected==='siliconflow'&&!voice.includes(':')?p.presets[routePresetKey('speech',selected)][input.tier].model+':'+voice:voice;}const adapter=adapterFor(selected);if(input.provider==='ark'||input.kind==='speech'&&selected==='minimax')input.provider='default';
    const useMinimaxVideo=input.kind==='video'&&input.provider==='minimax';
    if(!adapter&&input.kind!=='music'&&input.provider!=='default'&&!useMinimaxVideo)throw Error('Explicit provider selection applies to music or MiniMax video only');
    if(input.kind!=='image'&&input.kind!=='video'&&input.referenceImages.length)throw Error('Reference images only apply to image/video');
    for(const value of input.referenceImages){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Reference images require public HTTPS URLs without credentials/ports');const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.')||!h.includes('.')||(net.isIP(h)&&!publicIP(h)))throw Error('Local reference URL rejected');}
    const useBailian=input.kind==='music'&&input.provider==='bailian',useTencent=input.kind==='music'&&input.provider==='tencent';
    const preset=p.presets[adapter?routePresetKey(input.kind,selected):useMinimaxVideo?'minimaxVideo':useTencent?'tencentMusic':useBailian?'bailianMusic':input.kind][input.tier];
    let endpoint,keyEnvironment,body,units,adapterOptions;
    if(adapter){adapterOptions=adapter.build(input,preset);({endpoint,body,units}=adapterOptions);keyEnvironment=adapter.keyEnvironment;}else if(input.kind==='image'){
      if(input.prompt.length>2000)throw Error('Image prompt limited to 2000 characters');
      endpoint='https://ark.cn-beijing.volces.com/api/v3/images/generations';keyEnvironment='ARK_API_KEY';units=1;
      body={model:preset.model,prompt:input.prompt,size:input.tier==='preview'?'1.5K':'2K',response_format:'b64_json',output_format:'png',watermark:true,...(input.referenceImages.length?{image:input.referenceImages}:{})};
    } else if(input.kind==='video'){
      if(useMinimaxVideo){
        if(preset.model!==(input.tier==='preview'?'MiniMax-H3-Lite':'MiniMax-H3'))throw Error('MiniMax video model does not match reviewed tier contract');
        if(input.referenceImages.length)throw Error('MiniMax video fallback currently supports text-only input; reference media require separate review');
        if(input.generateAudio)throw Error('MiniMax H3 V2 has no reviewed generate_audio switch; explicit audio controls are not supported');
        if(input.ratio!=='16:9')throw Error('MiniMax video fallback currently supports the reviewed 16:9 preset only');
        endpoint='https://api.minimax.cn/v2/video_generation';keyEnvironment='MINIMAX_API_KEY';units=input.duration;
        body={model:preset.model,content:[{type:'text',text:input.prompt}],resolution:input.tier==='preview'?'480P':'768P',duration:input.duration,ratio:'16:9',aigc_watermark:true};
      }else{
      endpoint='https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';keyEnvironment='ARK_API_KEY';units=input.duration;
      if(input.referenceImages.length>1)throw Error('This adapter supports one first-frame reference; multi-reference input requires separate cost review');
      const effectiveRatio=preset.model==='doubao-seedance-2-5-260628'&&input.referenceImages.length?'adaptive':input.ratio;
      body={model:preset.model,content:[{type:'text',text:input.prompt},...input.referenceImages.map(url=>({type:'image_url',image_url:{url},role:'first_frame'}))],duration:input.duration,ratio:effectiveRatio,resolution:input.tier==='preview'?'480p':'720p',generate_audio:input.generateAudio,watermark:true};
      }
    } else if(input.kind==='speech'){
      endpoint='https://api.minimax.cn/v1/t2a_v2';keyEnvironment='MINIMAX_API_KEY';units=speechBillingCharacters(input.prompt)/1000;
      body={model:preset.model,text:input.prompt,stream:false,voice_setting:{voice_id:input.voiceId,speed:1,vol:1,pitch:0},audio_setting:{sample_rate:32000,bitrate:128000,format:'mp3',channel:1},output_format:'hex'};
    } else if(useBailian){
      if(input.prompt.length>2000||input.lyrics.length>350)throw Error('Bailian nonstreaming conservative limits: prompt <=2000, lyrics <=350 characters');
      endpoint=p.bailianWorkspaceId?`https://${p.bailianWorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation`:null;keyEnvironment='DASHSCOPE_API_KEY';units=1;
      if(input.lyrics&&input.lyrics.length<5)throw Error('Bailian lyrics must contain at least 5 characters');
      body={model:preset.model,input:{prompt:input.prompt,is_instrumental:input.instrumental,format:'mp3',...(!input.instrumental&&input.lyrics?{lyrics:input.lyrics}:{})}};
    } else if(useTencent){
      if(preset.model!=='MiniMaxMusic-3.0')throw Error('This Tencent adapter supports only the reviewed MiniMaxMusic 3.0 contract');
      if(input.prompt.length>2000)throw Error('Tencent music prompt limited to 2000 characters');
      if(!input.instrumental&&!input.lyrics)throw Error('Tencent vocal music requires explicit lyrics');
      endpoint=TENCENT_ENDPOINT;keyEnvironment='TENCENTCLOUD_SECRET_KEY';units=1;
      body={ModelName:'MiniMaxMusic',ModelVersion:'3.0',SceneType:'music',Prompt:input.prompt,ExtraParameters:{OutputAudioFormat:'mp3'},AdditionalParameters:JSON.stringify({is_instrumental:input.instrumental,...(!input.instrumental?{lyrics:input.lyrics}:{}),sample_rate:44100,bitrate:256000})};
    } else {
      if(input.prompt.length>2000)throw Error('Music style prompt limited to 2000 characters');
      if(!input.instrumental&&!input.lyrics)throw Error('Vocal music requires explicit lyrics');
      endpoint='https://api.minimax.cn/v1/music_generation';keyEnvironment='MINIMAX_API_KEY';units=1;
      body={model:preset.model,prompt:input.prompt,lyrics:input.lyrics,is_instrumental:input.instrumental,output_format:'hex',audio_setting:{sample_rate:44100,bitrate:256000,format:'mp3'}};
    }
    if(endpoint)validateURL(endpoint);
    const estimate=preset.unitPriceCNY===null?null:money(units*preset.unitPriceCNY);
    const plan={schemaVersion:1,input,provider:adapter?adapter.id:useMinimaxVideo?'minimax':useTencent?'tencent':useBailian?'bailian':input.kind==='image'||input.kind==='video'?'ark':'minimax',endpoint,keyEnvironment,body,estimateCNY:estimate,pricing:{...preset,units},disclosure:'Only the exact approved request will be sent to the named official provider. Estimate is not a provider billing cap.'};
    if(adapterOptions?.validUntil)plan.validUntil=adapterOptions.validUntil;if(adapterOptions?.warnings)plan.warnings=adapterOptions.warnings;
    if(adapter)plan.adapter={id:adapter.id,version:adapter.version,asyncTask:!!adapterOptions.asyncTask,binary:!!adapterOptions.binary};
    if(useTencent)plan.authentication={method:'official SDK TC3-HMAC-SHA256',credentialNames:['TENCENTCLOUD_SECRET_ID','TENCENTCLOUD_SECRET_KEY'],action:'CreateAigcAudioTask',version:'2019-06-12',region:'ap-guangzhou',storage:'No COS requested; official temporary output URL expires after 12h'};
    if(adapter&&input.kind==='video')plan.estimateDetails={method:'per-request conservative reservation',duration:body.duration===undefined?'provider-managed; no duration parameter sent':'explicit request duration, priced per second'};else if(input.kind==='video')plan.estimateDetails=useMinimaxVideo?{method:'conservative per-second reservation',ratePerSecondCNY:preset.unitPriceCNY,officialReferencePerSecondCNY:input.tier==='preview'?0.16:0.5,scope:'MiniMax H3 Lite480P / H3 768P, text only, 16:9, fixed4-15seconds; at least20% headroom. Actual account access, usage and invoice determine availability and charge.',audioNote:'Native model output may include synchronized sound; no documented audio on/off parameter is sent.'}:{method:'conservative configured per-second reservation',ratePerSecondCNY:preset.unitPriceCNY,inputVideoSeconds:0,officialReference5Seconds16x9CNY:input.tier==='preview'?1.86:7.56,officialTokenRatePerMillionCNY:input.tier==='preview'?37:70,scope:'Known Fast480p / Seedance2.5 720p presets only; text or one first-frame image, fixed 4-15 seconds, listed ratios. Default rates cover largest listed pixel area plus >10% headroom. Final usage.completion_tokens and account invoice determine actual charge.',effectiveRatio:body.ratio,firstFrameNote:body.ratio==='adaptive'?'Seedance2.5 first-frame contract requires adaptive; provider preserves input image ratio':null};
  return plan;
}

export function mediaPlanBlockers(plan,p){
    const blocks=[];if(plan.validUntil&&Date.now()>=Date.parse(plan.validUntil))blocks.push('供应商协议已到下线日期，禁止提交旧模型');if(!p.paidGenerationEnabled)blocks.push('Paid generation locked');if(!p.perRequestBudgetCNY||!p.monthlyBudgetCNY)blocks.push('Budget is zero');
    if(plan.estimateCNY===null||!plan.pricing.priceSource||!plan.pricing.priceCheckedAt)blocks.push('Local verified price/upper estimate missing');
    else {const t=Date.parse(plan.pricing.priceCheckedAt);if(!Number.isFinite(t)||Date.now()-t>30*86400000||t>Date.now()+60000)blocks.push('Price verification must be within last 30 days');}
    if(plan.input.kind==='music'&&plan.provider==='minimax'&&!p.minimaxMusicEligible)blocks.push('MiniMax music restricted to eligible historical paying users since 2026-08-20');
    if(plan.provider==='bailian'&&(!p.bailianMusicEligible||!p.bailianWorkspaceId))blocks.push('Bailian Fun-Music limited preview access and Beijing workspace required');
    if(plan.provider==='tencent'&&!p.tencentMusicEligible)blocks.push('Tencent MPS must be activated and music permissions confirmed locally; SecretId + SecretKey required');
    return blocks;
}

export class MediaStore {
  constructor({dataDir=path.join(here,'data'),policyPath=path.join(here,'..','media-policy.json'),transport=jsonRequest,downloadTransport=requestBytes,keyResolver=getKey,tencentTransport=tencentRequest,routingPath}={}){
    this.dataDir=dataDir;this.policyPath=policyPath;this.routingPath=routingPath||path.join(path.dirname(policyPath),'media-routing.json');this.transport=transport;this.downloadTransport=downloadTransport;this.keyResolver=keyResolver;this.tencentTransport=tencentTransport;
    fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync(path.join(dataDir,'outputs'),{recursive:true});
    this.db=new DatabaseSync(path.join(dataDir,'media.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,created TEXT NOT NULL,plan TEXT NOT NULL,hash TEXT NOT NULL,status TEXT NOT NULL,approved_hash TEXT,policy_hash TEXT,approved_at TEXT,expires TEXT,month TEXT,reserved REAL NOT NULL DEFAULT 0,task_id TEXT,response TEXT,files TEXT NOT NULL DEFAULT '[]',note TEXT);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,time TEXT NOT NULL,id TEXT,action TEXT NOT NULL,detail TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS immutable_plan BEFORE UPDATE OF plan,hash ON requests BEGIN SELECT RAISE(ABORT,'Immutable request; prepare a new request'); END;
      CREATE TRIGGER IF NOT EXISTS requests_no_delete BEFORE DELETE ON requests BEGIN SELECT RAISE(ABORT,'Request history cannot be deleted'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'Audit events are append-only'); END;`);
  }
  close(){this.db.close();}
  policy(){const base=JSON.parse(fs.readFileSync(this.policyPath,'utf8').replace(/^\uFEFF/,'')),routing=readRouting(this.routingPath);return policySchema.parse({...base,presets:{...base.presets,...routing.models}});}
  audit(id,action,detail={}){this.db.prepare('INSERT INTO events(time,id,action,detail) VALUES(?,?,?,?)').run(now(),id,action,JSON.stringify(detail));}
  get(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid request ID');const row=this.db.prepare('SELECT * FROM requests WHERE id=?').get(id);if(!row)throw Error('Unknown request');return {...row,plan:JSON.parse(row.plan),response:row.response?JSON.parse(row.response):null,files:JSON.parse(row.files)};}
  list(){return this.db.prepare('SELECT id,created,status,reserved,task_id,note FROM requests ORDER BY created DESC LIMIT 100').all();}
  status(){const p=this.policy();return {paidGenerationEnabled:p.paidGenerationEnabled,monthlyBudgetCNY:p.monthlyBudgetCNY,perRequestBudgetCNY:p.perRequestBudgetCNY,month:month(),reservedCNY:this.reserved(),keys:Object.fromEntries(['ARK_API_KEY','MINIMAX_API_KEY','DASHSCOPE_API_KEY','TENCENTCLOUD_SECRET_ID','TENCENTCLOUD_SECRET_KEY','SILICONFLOW_API_KEY'].map(n=>[n,hasKey(n)])),minimaxMusicEligible:p.minimaxMusicEligible,bailianMusicEligible:p.bailianMusicEligible,bailianWorkspaceConfigured:!!p.bailianWorkspaceId,tencentMusicEligible:p.tencentMusicEligible,defaultProviders:readRouting(this.routingPath).defaults,warning:'Local reservations are conservative estimates, not a provider billing cap. Set provider account limits too.'};}
  presetKey(plan){if(adapterFor(plan.provider))return routePresetKey(plan.input.kind,plan.provider);return plan.input.kind==='video'&&plan.provider==='minimax'?'minimaxVideo':plan.provider==='tencent'?'tencentMusic':plan.provider==='bailian'?'bailianMusic':plan.input.kind;}
  reserved(){return this.db.prepare("SELECT coalesce(sum(reserved),0) n FROM requests WHERE month=? OR status IN ('submitting','uncertain','submitted')").get(month()).n;}
  prepare(raw){
    const p=this.policy(),plan=buildMediaPlan(raw,p,readRouting(this.routingPath));
    const id=randomUUID(),digest=hash(plan);this.db.prepare('INSERT INTO requests(id,created,plan,hash,status) VALUES(?,?,?,?,?)').run(id,now(),JSON.stringify(plan),digest,'draft');this.audit(id,'prepare',{hash:digest});
    return {id,hash:digest,status:'draft',plan,blockers:this.blockers(plan,p)};
  }
  blockers(plan,p=this.policy()){
    return mediaPlanBlockers(plan,p);
  }
  approve(id,maxCNY){
    const p=this.policy(),r=this.get(id);if(r.status!=='draft')throw Error('Only a new draft can be approved');
    const b=this.blockers(r.plan,p);if(b.length)throw Error(b.join('; '));
    if(!Number.isFinite(maxCNY)||maxCNY<=0||maxCNY<r.plan.estimateCNY||maxCNY>p.perRequestBudgetCNY)throw Error('Approval must cover estimate and fit per-request budget');
    if(hash(r.plan)!==r.hash)throw Error('Request integrity failed');
    const preset=p.presets[this.presetKey(r.plan)][r.plan.input.tier];
    if(JSON.stringify(preset)!==JSON.stringify(Object.fromEntries(Object.entries(r.plan.pricing).filter(([k])=>k!=='units'))))throw Error('Policy changed; prepare a new request');
    if(r.plan.provider==='bailian'&&r.plan.endpoint!==`https://${p.bailianWorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation`)throw Error('Workspace changed; prepare again');
    this.db.exec('BEGIN IMMEDIATE');try{
      if(this.reserved()+maxCNY>p.monthlyBudgetCNY)throw Error('Monthly reservation budget exceeded');
      const changed=this.db.prepare("UPDATE requests SET status='approved',approved_hash=hash,policy_hash=?,approved_at=?,expires=?,month=?,reserved=? WHERE id=? AND status='draft'").run(hash(p),now(),new Date(Date.now()+p.approvalHours*3600000).toISOString(),month(),maxCNY,id).changes;
      if(changed!==1)throw Error('Request was already approved');this.audit(id,'human-approve',{hash:r.hash,maxCNY});this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}return this.get(id);
  }
  revoke(id){
    this.get(id);this.db.exec('BEGIN IMMEDIATE');try{
      if(this.db.prepare("UPDATE requests SET status='revoked',reserved=0,note='Human revoked before submission' WHERE id=? AND status IN ('draft','approved')").run(id).changes!==1)throw Error('Submitted/uncertain requests need provider reconciliation, not revocation');
      this.audit(id,'human-revoke');this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');throw e;}return this.get(id);
  }
  async execute(id){
    const p=this.policy(),r=this.get(id);if(r.status!=='approved')throw Error('Exact request lacks unused human approval');
    if(r.hash!==hash(r.plan)||r.approved_hash!==r.hash||r.policy_hash!==hash(p))throw Error('Request or policy changed; approval invalid');
    if(Date.parse(r.expires)<Date.now()||r.month!==month())throw Error('Approval expired or month changed; revoke and prepare again');
    const b=this.blockers(r.plan,p);if(b.length)throw Error(b.join('; '));
    const extension=adapterFor(r.plan.provider);if(r.plan.adapter&&(!extension||extension.version!==r.plan.adapter.version))throw Error('Adapter version changed; prepare again');
    const key=this.keyResolver(r.plan.keyEnvironment);
    const tencentCredentials=r.plan.provider==='tencent'?{secretId:this.keyResolver('TENCENTCLOUD_SECRET_ID'),secretKey:key}:null;
    this.db.exec('BEGIN IMMEDIATE');try{if(this.db.prepare("UPDATE requests SET status='submitting' WHERE id=? AND status='approved'").run(id).changes!==1)throw Error('Approval already consumed');this.audit(id,'submit-start',{hash:r.hash});this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
    try {
      let response=extension&&r.plan.adapter?.binary?await this.downloadTransport(r.plan.endpoint,{method:'POST',body:r.plan.body,key,purpose:'api',maxBytes:50*1024*1024}):tencentCredentials?await this.tencentTransport('CreateAigcAudioTask',r.plan.body,tencentCredentials):await this.transport(r.plan.endpoint,{method:'POST',body:r.plan.body,key,maxBytes:r.plan.input.kind==='image'?80*1024*1024:40*1024*1024});
      if(extension&&r.plan.adapter?.binary){if(response.status!==200)throw Error('Speech provider rejected request');const file=this.saveFile(id,response.bytes,outputFormat(response.bytes,'speech'));this.db.prepare("UPDATE requests SET status='completed',response=?,files=? WHERE id=?").run(JSON.stringify({bytes:response.bytes.length}),JSON.stringify([file]),id);this.audit(id,'completed',{files:[file]});
      }else if(r.plan.adapter?.asyncTask||r.plan.input.kind==='video'||r.plan.provider==='tencent'){
        const taskId=extension?extension.taskId(response):r.plan.provider==='tencent'?response.TaskId:r.plan.provider==='minimax'?response.task_id:response.id;
        if(typeof taskId!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(taskId))throw Error('Submission response has no valid task ID');
        this.db.prepare("UPDATE requests SET status='submitted',task_id=?,response=? WHERE id=?").run(taskId,JSON.stringify(response),id);this.audit(id,'submitted',{taskId});
      }else{
        const files=this.saveInline(id,r.plan,response);
        this.db.prepare("UPDATE requests SET status='completed',response=?,files=? WHERE id=?").run(JSON.stringify(this.metadata(response)),JSON.stringify(files),id);this.audit(id,'completed',{files});
      }
    } catch(e){this.db.prepare("UPDATE requests SET status='uncertain',note=? WHERE id=?").run('Submission may have reached provider; no automatic retry. '+String(e.message).slice(0,300),id);this.audit(id,'uncertain');throw Error('Submission failed or result could not be saved. Reservation retained; reconcile provider console before retry.');}
    return this.get(id);
  }
  metadata(value){return JSON.parse(JSON.stringify(value,(k,v)=>['audio','b64_json'].includes(k)&&typeof v==='string'&&!v.startsWith('https:')?`[inline data ${v.length} characters saved separately]`:v));}
  saveInline(id,plan,response){
    const files=[];
    const extension=adapterFor(plan.provider);if(extension){const url=extension.outputURL(plan,response);if(!url)throw Error('Missing adapter output URL');outputDownloadURL(url);return files;}
    if(plan.input.kind==='image'){
      if(!Array.isArray(response.data)||response.data.length!==1)throw Error('Expected exactly one generated image');
      const item=response.data[0];if(item.error)throw Error('Image generation returned item error');
      if(item.b64_json){if(!/^[A-Za-z0-9+/=\r\n]+$/.test(item.b64_json))throw Error('Invalid image encoding');const buf=Buffer.from(item.b64_json,'base64');files.push(this.saveFile(id,buf,outputFormat(buf,'image')));}
      else if(!item.url)throw Error('Missing image output');
    } else if(plan.provider!=='bailian'){
      if(response.data?.status!==2)throw Error('Audio provider did not confirm complete synthesis');
      const audio=response.data?.audio;if(typeof audio!=='string'||!audio.length||audio.length%2||!/^[0-9a-f]+$/i.test(audio))throw Error('Missing/invalid hexadecimal audio');const bytes=Buffer.from(audio,'hex');files.push(this.saveFile(id,bytes,outputFormat(bytes,'audio')));
    } else {if(response.output?.finish_reason!=='stop')throw Error('Bailian did not confirm complete nonstreaming synthesis');if(!response.output?.audio?.url)throw Error('Missing Bailian audio URL');outputDownloadURL(response.output.audio.url);}
    return files;
  }
  saveFile(id,bytes,ext){if(bytes.length===0||bytes.length>500*1024*1024)throw Error('Output size invalid');const dest=path.join(this.dataDir,'outputs',id+'.'+ext);fs.writeFileSync(dest,bytes,{flag:'wx'});return {path:dest,bytes:bytes.length,sha256:hash(bytes)};}
  async poll(id){
    const r=this.get(id);if((!r.plan.adapter?.asyncTask&&r.plan.input.kind!=='video'&&r.plan.provider!=='tencent')||!r.task_id||!['submitted','completed','failed'].includes(r.status))throw Error('Only submitted video/Tencent music jobs can be queried');
    if(r.status!=='submitted')return r;
    const extension=adapterFor(r.plan.provider),poll=extension?.pollRequest(r.task_id);const response=extension?await this.transport(poll.url,{...poll.options,key:this.keyResolver(extension.keyEnvironment)}):r.plan.provider==='tencent'?await this.tencentTransport('DescribeAigcAudioTask',{TaskId:r.task_id},{secretId:this.keyResolver('TENCENTCLOUD_SECRET_ID'),secretKey:this.keyResolver('TENCENTCLOUD_SECRET_KEY')}):r.plan.provider==='minimax'?await this.transport('https://api.minimax.cn/v2/query/video_generation/'+encodeURIComponent(r.task_id),{key:this.keyResolver('MINIMAX_API_KEY')}):await this.transport('https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/'+encodeURIComponent(r.task_id),{key:this.keyResolver('ARK_API_KEY')});
    let status;
    if(extension){status=extension.pollStatus(response);}else if(r.plan.provider==='tencent'){
      if(!['WAIT','RUN','FAIL','DONE'].includes(response.Status))throw Error('Unknown Tencent task status; original job preserved');
      status=response.Status==='DONE'?'completed':response.Status==='FAIL'?'failed':'submitted';
      if(status==='completed'&&!response.AudioInfos?.[0]?.Url)throw Error('Tencent finished without an audio result URL');
    }else if(r.plan.provider==='minimax'){
      const state=response.task?.status;
      if(!['queued','running','succeeded','failed','cancelled'].includes(state))throw Error('Unknown MiniMax video status; original job preserved');
      status=state==='succeeded'?'completed':['failed','cancelled'].includes(state)?'failed':'submitted';
      if(status==='completed'&&!response.task?.content?.url)throw Error('MiniMax video finished without a result URL');
    }else{
      if(!['queued','running','succeeded','failed','cancelled','expired'].includes(response.status))throw Error('Unknown video task status; original job preserved');
      status=response.status==='succeeded'?'completed':['failed','cancelled','expired'].includes(response.status)?'failed':'submitted';
      if(status==='completed'&&!response.content?.video_url)throw Error('Video finished without a result URL');
    }
    this.db.prepare("UPDATE requests SET status=?,response=? WHERE id=? AND status='submitted'").run(status,JSON.stringify(response),id);this.audit(id,'poll',{status:response.Status||response.status||response.task?.status});return this.get(id);
  }
  async download(id){
    const r=this.get(id);if(r.status!=='completed')throw Error('Generation is not complete');if(r.files.length)return r;
    const extension=adapterFor(r.plan.provider);const value=extension?extension.outputURL(r.plan,r.response):r.plan.provider==='tencent'?r.response?.AudioInfos?.[0]?.Url:r.plan.input.kind==='video'&&r.plan.provider==='minimax'?r.response?.task?.content?.url:r.plan.input.kind==='video'?r.response?.content?.video_url:r.plan.input.kind==='image'?r.response?.data?.[0]?.url:r.response?.output?.audio?.url;
    if(!value)throw Error('No downloadable result URL');const downloadURL=outputDownloadURL(value);
    const res=await this.downloadTransport(downloadURL,{purpose:'download',maxBytes:r.plan.input.kind==='video'?500*1024*1024:50*1024*1024,timeoutMs:180000});
    if(res.status!==200)throw Error('Download failed; no generation retry was made');
    const ext=outputFormat(res.bytes,r.plan.input.kind);const file=this.saveFile(id,res.bytes,ext);
    this.db.prepare('UPDATE requests SET files=? WHERE id=?').run(JSON.stringify([file]),id);this.audit(id,'download',{file});return this.get(id);
  }
  reconcile(id,actualCNY,note){
    if(!Number.isFinite(actualCNY)||actualCNY<0||!note?.trim())throw Error('Actual amount and provider reconciliation note required');
    const r=this.get(id);if(!['completed','failed','uncertain','submitting','submitted','reconciled'].includes(r.status))throw Error('Only submitted requests can be reconciled');
    const status=['uncertain','submitting'].includes(r.status)?'reconciled':r.status;
    this.db.prepare('UPDATE requests SET reserved=?,note=?,status=? WHERE id=?').run(actualCNY,'Human reconciled: '+note.slice(0,1000),status,id);this.audit(id,'human-reconcile',{actualCNY,note});return this.get(id);
  }
}
