import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {atomicJSON} from './policy3.mjs';import {reviewedNodes} from './workflow-format31.mjs';
const file=root=>path.join(root,'node-reviews31.json');
const rows=root=>fs.existsSync(file(root))?JSON.parse(fs.readFileSync(file(root))):[];
const hash=d=>createHash('sha256').update(JSON.stringify(d)).digest('hex');
export function nodePolicy31(root,inst,info){
 const accepted=new Set(reviewedNodes);
 for(const r of rows(root))if(r.instanceId===inst.id&&r.instanceUrl===inst.url&&info[r.node]&&!info[r.node].api_node&&hash(info[r.node])===r.definitionHash)accepted.add(r.node);
 return accepted;
}
export function nodeReviewRequests31(root,inst,graph,info){
 const accepted=nodePolicy31(root,inst,info);
 return [...new Set(Object.values(graph).map(n=>n.class_type))].filter(node=>info[node]&&!accepted.has(node)&&!info[node].api_node).map(node=>({node,definitionHash:hash(info[node]),instanceId:inst.id,warning:'仅在你已审查此实例上的节点代码、确认不调用收费云端且不访问未授权文件时批准。节点定义哈希不是代码签名或沙箱。'}));
}
export function reviewNode31(root,inst,info,a){
 if(!inst.local)throw Error('自定义节点审查仅允许本地实例，远程执行授权需另行处理');
 const d=info[a.node];if(!d||d.api_node)throw Error('节点不存在或声明为云端 API，不能批准为本地节点');
 if(a.acknowledgeLocalOnly!==true||a.definitionHash!==hash(d))throw Error('必须明确确认本地代码审查，且节点定义不能已改变');
 const list=rows(root),record={instanceId:inst.id,instanceUrl:inst.url,node:a.node,definitionHash:hash(d),reviewedAt:new Date().toISOString(),scope:'user-reviewed local node; not a Python sandbox'};
 atomicJSON(file(root),[...list.filter(r=>!(r.instanceId===inst.id&&r.node===a.node)),record]);return record;
}
