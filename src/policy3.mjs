import {instanceReferences31} from './instance-identity31.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const modes = ['Cloud','Local','Hybrid','Auto'];
export const kinds = ['image','video','music','speech'];
const own = (obj,key) => Object.hasOwn(obj,key) ? obj[key] : undefined;
const defaultSettings = () => ({mode:'Auto',kinds:{},sessions:{},tasks:{},instances:[{id:'local',label:'本机 ComfyUI',url:'http://127.0.0.1:8188',trusted:true}],sessionBudgetCNY:0});
function mapModes(value, allowed) {
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length>1000) throw Error('模式映射无效');
  for(const [key,mode] of Object.entries(value)) {
    if(!key||key.length>250||['__proto__','constructor','prototype'].includes(key)||allowed&&!allowed.includes(key)||!modes.includes(mode))throw Error('模式或范围无效');
  }
  return value;
}
export function isLoopback(url){return ['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);}
export function verifySettings(raw) {
  const value={...defaultSettings(),...raw};
  if(!modes.includes(value.mode))throw Error('未知执行模式');
  mapModes(value.kinds,kinds);mapModes(value.sessions);mapModes(value.tasks);
  if(!Number.isFinite(value.sessionBudgetCNY)||value.sessionBudgetCNY<0||value.sessionBudgetCNY>10000)throw Error('会话限额无效');
  if(!Array.isArray(value.instances)||value.instances.length>20)throw Error('实例数量无效');
  const seen=new Set();
  const instances=value.instances.map(i=>{
    if(!/^[a-zA-Z0-9_-]{1,64}$/.test(i.id)||seen.has(i.id))throw Error('实例编号重复或无效');
    seen.add(i.id);if(i.enabled!==undefined&&typeof i.enabled!=='boolean')throw Error('实例启用状态无效');const u=new URL(i.url);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!isLoopback(u)&&u.protocol!=='https:')throw Error('实例需使用无凭证的服务根地址；远程必须 HTTPS');
    if(i.credentialRef&&!/^(?:stored:[a-zA-Z0-9_-]{1,100}|env:[a-zA-Z0-9_]{1,100})$/.test(i.credentialRef))throw Error('实例凭证必须使用安全引用');
    return {id:i.id,label:String(i.label??'').trim().slice(0,100),enabled:i.enabled!==false,url:u.href.replace(/\/$/,''),trusted:i.trusted===true,credentialRef:i.credentialRef||''};
  });
  return {mode:value.mode,kinds:value.kinds,sessions:value.sessions,tasks:value.tasks,instances,sessionBudgetCNY:value.sessionBudgetCNY};
}
export function loadSettings3(root){const file=path.join(root,'studio3-settings.json');return fs.existsSync(file)?verifySettings(JSON.parse(fs.readFileSync(file))):defaultSettings();}
export function atomicJSON(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),{flag:'wx'});try{fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}}
export function saveSettings3(root,raw,{removeId}={}){const s=verifySettings(raw),f=path.join(root,'studio3-settings.json');if(fs.existsSync(f)){const old=loadSettings3(root);for(const i of old.instances.filter(i=>!s.instances.some(n=>n.id===i.id))){if(i.id!==removeId)throw Error('移除实例需先断开并通过专用引用检查');const audit=instanceReferences31(root,i.id);if(i.enabled!==false||!audit.removable)throw Error('实例启用中、仍有引用或引用无法完整检查，禁止移除');}for(const i of s.instances)if(old.instances.some(p=>p.id===i.id&&p.url!==i.url)){i.credentialRef='';i.trusted=false;}}atomicJSON(f,s);return s;}
export function modeFor(s,kind,owner,call){return own(s.tasks,owner+'/'+call)||own(s.sessions,owner)||own(s.kinds,kind)||s.mode;}
export function effectiveMode(root,kind,owner='',call=''){
 const s=loadSettings3(root);
 const cleanCall=String(call||'').replace(owner+':','');const key=owner+'/'+cleanCall,next=owner+'/*';
 if(owner&&cleanCall&&own(s.tasks,next)&&!own(s.tasks,key)){s.tasks[key]=s.tasks[next];delete s.tasks[next];saveSettings3(root,s);}
 const planFile=path.join(root,'studio3-plans.json');let preferred;
 if(fs.existsSync(planFile)){const plans=JSON.parse(fs.readFileSync(planFile));preferred=plans.plans.find(p=>p.id===plans.active[kind])?.mode;}
 const mode=own(s.tasks,key)||own(s.sessions,owner)||own(s.kinds,kind)||preferred||s.mode;
 return mode;
}
export function enforce(root,kind,executor,owner='',call=''){
 const mode=effectiveMode(root,kind,owner,call);
 if((mode==='Local'&&executor!=='local')||(mode==='Cloud'&&executor==='local'))throw Error('当前 '+mode+' 模式禁止此执行器');
 return mode;
}
