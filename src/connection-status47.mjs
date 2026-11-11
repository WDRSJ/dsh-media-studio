import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';import{atomicJSON}from'./policy3.mjs';
const file=root=>path.join(root,'connection-checks47.json');
export const connectionHash47=c=>createHash('sha256').update(JSON.stringify(c)).digest('hex');
const records=root=>{try{const value=JSON.parse(fs.readFileSync(file(root),'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return{};}};
export function saveConnectionCheck47(root,c,{status,count=0}){const row={status,count,connectionHash:connectionHash47(c),at:new Date().toISOString(),scope:'model-list-only; never generation permission or payment approval'};atomicJSON(file(root),{...records(root),[c.id]:row});return row;}
export function connectionChecks47(root,connections){const rows=records(root);return Object.fromEntries(connections.flatMap(c=>{const r=rows[c.id];return r&&r.connectionHash===connectionHash47(c)?[[c.id,{...r,fresh:Date.now()-Date.parse(r.at)<300000}]]:[];}));}
