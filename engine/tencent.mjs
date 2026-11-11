import sdk from 'tencentcloud-sdk-nodejs-mps';
import https from 'node:https';
import dns from 'node:dns/promises';
import {publicIP,validateURL} from './network.mjs';
export const TENCENT_ENDPOINT='https://mps.tencentcloudapi.com/';
export function tencentConfig(secretId,secretKey,agent){return {credential:{secretId,secretKey},region:'ap-guangzhou',profile:{signMethod:'TC3-HMAC-SHA256',httpProfile:{endpoint:'mps.tencentcloudapi.com',protocol:'https://',reqMethod:'POST',reqTimeout:90,agent}}};}
export class OneShotMpsAgent extends https.Agent {
  constructor(address){super({keepAlive:false,maxSockets:1,lookup:(_h,options,cb)=>options?.all?cb(null,[address]):cb(null,address.address,address.family)});this.requests=0;}
  addRequest(req,options){
    if(++this.requests>1||(options.hostname||options.host)!=='mps.tencentcloudapi.com'||options.path!=='/'||req.method!=='POST'){queueMicrotask(()=>{req.emit('error',Error('Tencent request retry/redirect rejected'));req.destroy();});return;}
    super.addRequest(req,options);
  }
}
// Official SDK performs TC3 signing. This installed SDK has no automatic retry
// loop; the one-request agent additionally blocks redirects or resubmissions.
export async function tencentRequest(action,body,{secretId,secretKey}){
  if(!['CreateAigcAudioTask','DescribeAigcAudioTask'].includes(action))throw Error('Unsupported Tencent action');
  validateURL(TENCENT_ENDPOINT);
  const addresses=await dns.lookup('mps.tencentcloudapi.com',{all:true});
  if(!addresses.length||addresses.some(x=>!publicIP(x.address)))throw Error('Tencent DNS destination is not public');
  const agent=new OneShotMpsAgent(addresses.find(x=>x.family===4)||addresses[0]);
  const client=new sdk.mps.v20190612.Client(tencentConfig(secretId,secretKey,agent));
  try{return await client[action](body);}catch(e){const code=/^[A-Za-z0-9_.-]{1,120}$/.test(e.code||'')?e.code:'RequestFailed';throw Error('Tencent MPS '+code+'; inspect official console before any new submission');}finally{agent.destroy();}
}
