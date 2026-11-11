import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const names=new Set(['ARK_API_KEY','MINIMAX_API_KEY','DASHSCOPE_API_KEY','TENCENTCLOUD_SECRET_ID','TENCENTCLOUD_SECRET_KEY','SILICONFLOW_API_KEY']);
export function hasKey(name){return names.has(name)&&!!(process.env[name]||fs.existsSync(path.join(root,'secrets',name+'.dpapi')));}
export function getKey(name){
  if(!names.has(name))throw Error('Unknown key name');
  let key=process.env[name];
  if(!key&&process.platform==='win32'&&hasKey(name))key=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'Read-Key.ps1'),'-Name',name],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();
  if(!key||/[\r\n]/.test(key))throw Error(`Missing or invalid ${name}; use local Set-Keys.ps1, never paste a key in chat`);
  return key;
}
