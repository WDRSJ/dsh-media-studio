import {adapters} from './adapters/index.mjs';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';

export const API_HOSTS = new Set(['ark.cn-beijing.volces.com','api.minimax.cn','mps.tencentcloudapi.com',...[...adapters.values()].flatMap(a=>a.apiHosts)]);
const DOWNLOAD_SUFFIXES=['volces.com','volccdn.com','byteimg.com','ibytedtos.com','minimax.chat','minimax.cn','minimaxi.com','aliyuncs.com','myqcloud.com','hailuoai.com',...[...adapters.values()].flatMap(a=>a.downloadSuffixes)];
export function outputDownloadURL(value){
  const u=new URL(value);
  // Official Fun-Music examples may return HTTP OSS links. Upgrade that known
  // storage origin; never fetch plaintext or forward authorization to storage.
  const officialStorage=u.hostname.endsWith('.oss-cn-beijing.aliyuncs.com')||(u.hostname.endsWith('.myqcloud.com')&&/\.cos[.-]/.test(u.hostname));
  if(u.protocol==='http:'&&officialStorage&&!u.username&&!u.password&&!u.port)u.protocol='https:';
  return validateURL(u.href,'download').href;
}
export function publicIP(ip) {
  if(net.isIP(ip)===4){const [a,b,c]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||(b===2&&c===0)))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0));}
  return net.isIP(ip)===6 && /^[23]/i.test(ip) && !ip.toLowerCase().startsWith('2001:db8:');
}
export function validateURL(value, purpose='api') {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||u.hash)throw Error('Only credential-free HTTPS on port 443 is allowed');
  const h=u.hostname.toLowerCase();
  const allowed=purpose==='api' ? API_HOSTS.has(h)||/^[a-z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(h) : DOWNLOAD_SUFFIXES.some(s=>h===s||h.endsWith('.'+s));
  if(!allowed||net.isIP(h))throw Error('Host is outside official provider allowlist');
  return u;
}
// Resolve once, reject private addresses, and pin the checked result to the TLS request.
// Redirects are intentionally rejected so credentials cannot follow a redirect.
export async function requestBytes(url,{method='GET',body,key,purpose='api',maxBytes=20*1024*1024,timeoutMs=180000,signal}={}) {
  const u=validateURL(url,purpose);const answers=await dns.lookup(u.hostname,{all:true});
  if(!answers.length||answers.some(x=>!publicIP(x.address)))throw Error('Private/reserved DNS destination rejected');
  const selected=answers.find(x=>x.family===4)||answers[0];
  const payload=body===undefined?undefined:Buffer.from(JSON.stringify(body));
  return await new Promise((resolve,reject)=>{
    const headers={Accept:'application/json',...(payload?{'Content-Type':'application/json','Content-Length':payload.length}:{}),...(key?{Authorization:`Bearer ${key}`}:{})};
    const req=https.request(u,{method,headers,signal,lookup:(_h,opts,cb)=>opts?.all?cb(null,[selected]):cb(null,selected.address,selected.family)},res=>{
      const code=res.statusCode||0;
      if(code>=300&&code<400){res.resume();reject(Error('Redirect rejected'));return;}
      if(Number(res.headers['content-length'])>maxBytes){res.destroy();reject(Error('Response exceeds size limit'));return;}
      let total=0;const chunks=[];
      res.on('data',chunk=>{total+=chunk.length;if(total>maxBytes){res.destroy(Error('Response exceeds size limit'));return;}chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>resolve({status:code,headers:res.headers,bytes:Buffer.concat(chunks)}));
    });
    const timer=setTimeout(()=>req.destroy(Error('Request timed out; submission may have reached provider')),timeoutMs);timer.unref();
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);if(payload)req.write(payload);req.end();
  });
}
export async function jsonRequest(url,options={}) {
  const response=await requestBytes(url,options);
  if(response.status<200||response.status>=300)throw Error(`Provider HTTP ${response.status}; inspect provider console before retrying`);
  let value;try{value=JSON.parse(response.bytes.toString('utf8'));}catch{throw Error('Provider returned invalid JSON');}
  if(value.error || (value.base_resp?.status_code!==undefined&&value.base_resp.status_code!==0))throw Error('Provider rejected request; inspect provider console for details');
  return value;
}
