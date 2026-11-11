import {resourceManage49,resourceOverview49} from './resource-management49.mjs';
import {connectionChecks47,saveConnectionCheck47} from './connection-status47.mjs';
import {ConnectionStore} from './connections.mjs';
import {catalog} from './catalog.mjs';
import {protocols,official,authFields}from'./protocols.mjs';
import {readBudget,writeBudget}from'./budget.mjs';
import {request}from'./http.mjs';
import {randomUUID}from'node:crypto';
export function registerConnections(ctx,root,token,vault,{transport=request}={}){
 const store=new ConnectionStore(root);
 return ctx.webServer.register({kind:'exact',path:'/media-studio/connections',handler:async(req,res)=>{
  res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');
  const state=()=>{const s=store.load();return {...s,resources:resourceOverview49(root),connectionChecks:connectionChecks47(root,s.value.connections),budget:readBudget(root),catalog:catalog.map(p=>({...p,fields:authFields(p.id),official:official[p.id]||''})),protocols,credentials:Object.fromEntries(s.value.connections.map(c=>[c.id,{APIKey:vault?.has(c.credentialRef)||false,SecretKey:pKey(c),...Object.fromEntries(Object.entries(c.credentialRefs||{}).map(([k,v])=>[k,vault?.has(v)||false]))}]))};};
  const pKey=c=>c.providerId==='tencent'&&!!vault?.has(c.credentialRef);
  try{if(req.method==='GET'){res.end(JSON.stringify(state()));return;}
   if(req.method!=='POST'||req.headers['x-media-token']!==token)throw Error('Unauthorized');
   if(req.headers.origin&&req.headers.origin!=='dsh-app://app'&&new URL(req.headers.origin).host!==req.headers.host)throw Error('Cross-origin request refused');
   let raw='';for await(const b of req){raw+=b;if(raw.length>300000)throw Error('Configuration too large');}
   const input=JSON.parse(raw);
   if(input.action==='resourceManage'){const result=resourceManage49(root,input);res.end(JSON.stringify({...state(),result}));return;}
   if(input.action==='test'||input.action==='models'){
    const c=store.load().value.connections.find(c=>c.id===input.id);if(!c)throw Error('请先保存连接');
    if(!['openai','siliconflow','xai','zhipu'].includes(c.providerId)||!c.endpoint){saveConnectionCheck47(root,c,{status:'unsupported'});throw Error('此连接尚无经过核实的免费模型查询接口；未发送请求');}
    if(!vault?.has(c.credentialRef)){saveConnectionCheck47(root,c,{status:'missing-credential'});throw Error('此连接未配置可用凭证；未发送请求');}
    try{const url=c.endpoint.replace(/\/$/,'')+'/models',r=await transport(url,{headers:{Authorization:'Bearer '+vault.get(c.credentialRef)},origins:[new URL(url).origin],signal:AbortSignal.timeout(15000),maxBytes:2*1024*1024});const data=JSON.parse(r.bytes);if(!Array.isArray(data.data)||data.data.some(x=>!x||typeof x.id!=='string'))throw Error('模型列表响应格式无效');const models=data.data.map(x=>x.id).slice(0,1000),check=saveConnectionCheck47(root,c,{status:'success',count:models.length});res.end(JSON.stringify({models,check,message:'模型查询成功；未调用生成接口，不代表所有模型均有生成权限。'}));return;}catch(e){saveConnectionCheck47(root,c,{status:/HTTP (401|403)/.test(e.message)?'denied':'failed'});throw e;}
   }else if(input.action==='budget'){writeBudget(root,input.value);}else if(input.action==='credential'){
    if(!vault)throw Error('凭证服务未启用');const s=store.load();if(input.revision!==s.revision)throw Error('配置已变化，请刷新');const c=s.value.connections.find(c=>c.id===input.id);if(!c)throw Error('连接不存在');const f=input.field||'APIKey';if(!['APIKey','SecretId','SecretKey','AppID','APISecret','AccessToken'].includes(f))throw Error('未知凭证字段');
    const primary=['APIKey','SecretKey'].includes(f),old=primary?c.credentialRef:c.credentialRefs?.[f];let ref=old;
    if(input.operation==='set'){ref='stored:'+c.id+'_'+f+'_'+randomUUID().replaceAll('-','').slice(0,12);vault.set(ref,input.value);}else if(input.operation==='bind'){if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,99}$/.test(input.value))throw Error('环境变量名无效');ref='env:'+input.value;}else if(input.operation==='clear'){ref='';}else throw Error('未知操作');
    if(primary)c.credentialRef=ref;else{c.credentialRefs||={};if(ref)c.credentialRefs[f]=ref;else delete c.credentialRefs[f];}store.save(s.value,s.revision);
    if(input.operation==='clear'&&old?.startsWith('stored:')){const current=store.load().value;if(!current.connections.some(x=>x.credentialRef===old||Object.values(x.credentialRefs||{}).includes(old)))vault.clear(old);}
   }else{if(Object.keys(input).some(k=>!['value','revision'].includes(k)))throw Error('Unexpected field');store.save(input.value,input.revision);}
   res.end(JSON.stringify(state()));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message,...e.conflicts?{conflicts:e.conflicts}:{}}));}
 }});
}
