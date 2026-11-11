import {recoverResources49,withResourceLock49,assertNotArchived49} from './resource-journal49.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {catalog,kinds} from './catalog.mjs';

const digest = value=>createHash('sha256').update(value).digest('hex');
const object = x=>x && typeof x==='object' && !Array.isArray(x);
const idOK = x=>typeof x==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(x);
function only(value,keys){if(!object(value)||Object.keys(value).some(k=>!keys.includes(k)))throw Error('Unexpected configuration field');}
function text(value,max=500){if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))throw Error('Invalid text');}
export function validateConnections(value){
 only(value,['schemaVersion','customProviders','connections','defaults','tierRoutes']);
 if(value.schemaVersion!==2||!Array.isArray(value.customProviders)||value.customProviders.length>100||!Array.isArray(value.connections)||value.connections.length>300)throw Error('Invalid connection schema');
 const providers=new Set(catalog.map(p=>p.id));
 for(const p of value.customProviders){only(p,['id','label','kinds','enabled']);if(p.enabled!==undefined&&typeof p.enabled!=='boolean')throw Error('Invalid provider status');if(!idOK(p.id)||providers.has(p.id))throw Error('Duplicate or invalid provider');text(p.label,100);if(!p.label.trim()||!Array.isArray(p.kinds)||!p.kinds.length||new Set(p.kinds).size!==p.kinds.length||p.kinds.some(k=>!kinds.includes(k)))throw Error('Invalid capabilities');providers.add(p.id);}
 const seen=new Map();
 for(const c of value.connections){
  only(c,['id','providerId','kind','label','enabled','endpoint','protocol','modelPreview','modelStandard','modelQuality','voice','credentialRef','parameters','pricing','mapping','credentialRefs']);
  if(!idOK(c.id)||seen.has(c.id)||!providers.has(c.providerId)||!kinds.includes(c.kind)||typeof c.enabled!=='boolean')throw Error('Invalid connection');
  const provider=[...catalog,...value.customProviders].find(p=>p.id===c.providerId);if(!provider.kinds.includes(c.kind))throw Error('Unsupported provider capability');
  for(const key of ['label','endpoint','protocol','modelPreview','modelQuality','voice','credentialRef'])text(c[key]);
  if(c.modelStandard!==undefined)text(c.modelStandard);if(c.endpoint){const u=new URL(c.endpoint);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw Error('Endpoint must be credential-free HTTPS');}
  if(c.credentialRef && !/^(stored|env):[a-zA-Z0-9_-]{1,100}$/.test(c.credentialRef))throw Error('Invalid credential reference');
  if(c.credentialRefs){if(!object(c.credentialRefs))throw Error('Invalid credential references');for(const [k,v]of Object.entries(c.credentialRefs))if(!idOK(k)||! /^(stored|env):[a-zA-Z0-9_-]{1,100}$/.test(v))throw Error('Invalid credential reference');}
  if(c.parameters){if(!object(c.parameters)||JSON.stringify(c.parameters).length>12000||Object.keys(c.parameters).some(k=>/^(authorization|password|api[_-]?key|client[_-]?secret|secret[_-]?key|access[_-]?token|refresh[_-]?token|token|secret)$/i.test(k)))throw Error('参数不得含明文凭证');}
  if(c.pricing){only(c.pricing,['rate','unit','currency','source','fxCNY','checkedAt']);if(c.pricing.rate!==null&&(!Number.isFinite(c.pricing.rate)||c.pricing.rate<0))throw Error('Invalid price');if(!['request','second','kchar'].includes(c.pricing.unit)||!['CNY','USD','EUR'].includes(c.pricing.currency))throw Error('Unsupported billing unit');if(c.pricing.fxCNY!==undefined&&c.pricing.fxCNY!==null&&(!Number.isFinite(c.pricing.fxCNY)||c.pricing.fxCNY<=0))throw Error('Invalid exchange rate');text(c.pricing.source,2000);}
  if(c.mapping&&(!object(c.mapping)||JSON.stringify(c.mapping).length>16000||/"(?:authorization|api[_-]?key|secret|token|password)"\s*:/i.test(JSON.stringify(c.mapping))))throw Error('映射只允许非秘密请求字段');
  seen.set(c.id,c);
 }
 if(value.tierRoutes){only(value.tierRoutes,kinds);for(const [kind,routes] of Object.entries(value.tierRoutes)){only(routes,['preview','standard','premium']);for(const id of Object.values(routes))if(id&&seen.get(id)?.kind!==kind)throw Error('档位连接不属于此类别');}}
 only(value.defaults,kinds);
 for(const kind of kinds){const ref=value.defaults[kind];if(ref!==null&&(!seen.has(ref)||seen.get(ref).kind!==kind))throw Error('Invalid default connection');}
 return structuredClone(value);
}
export class ConnectionStore {
 constructor(root){this.file=path.join(root,'connections.v2.json');}
 load(){recoverResources49(path.dirname(this.file));const raw=fs.existsSync(this.file)?fs.readFileSync(this.file,'utf8'):'';const value=raw?validateConnections(JSON.parse(raw)):{schemaVersion:2,customProviders:[],connections:[],defaults:Object.fromEntries(kinds.map(k=>[k,null]))};return {revision:digest(raw),value};}
 save(value,revision){return withResourceLock49(path.dirname(this.file),()=>this.saveUnlocked49(value,revision));}
 saveUnlocked49(value,revision){value=validateConnections(value);fs.mkdirSync(path.dirname(this.file),{recursive:true});const lock=this.file+'.lock';let fd,tmp;
  try{fd=fs.openSync(lock,'wx');const old=this.load();if(old.revision!==revision)throw Error('Settings changed; reload before saving');if(old.value.connections.some(c=>!value.connections.some(n=>n.id===c.id))||old.value.customProviders.some(p=>!value.customProviders.some(n=>n.id===p.id)))throw Error('删除已保存资源请使用专用可恢复删除操作；不能通过普通保存留下悬空引用');for(const c of value.connections)assertNotArchived49(path.dirname(this.file),'account',c.id);for(const p of value.customProviders)assertNotArchived49(path.dirname(this.file),'provider',p.id);for(const c of value.connections){const previous=old.value.connections.find(x=>x.id===c.id);if(previous&&(c.modelPreview!==previous.modelPreview||c.modelQuality!==previous.modelQuality||c.modelStandard!==previous.modelStandard)&&JSON.stringify(c.pricing)===JSON.stringify(previous.pricing))c.pricing={...(c.pricing||{unit:'request',currency:'CNY',source:''}),rate:null,checkedAt:null};else if(c.pricing&&JSON.stringify(c.pricing)!==JSON.stringify(previous?.pricing))c.pricing.checkedAt=new Date().toISOString();}tmp=this.file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});fs.renameSync(tmp,this.file);return this.load();}
  finally{if(tmp&&fs.existsSync(tmp))fs.unlinkSync(tmp);if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}}
 }
}
