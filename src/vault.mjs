import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script=String.raw`$ErrorActionPreference='Stop';Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -Force;Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force;$x=[Console]::In.ReadToEnd()|ConvertFrom-Json;if($x.op -eq 'set'){$s=ConvertTo-SecureString $x.value -AsPlainText -Force;$v=ConvertFrom-SecureString $s;[IO.File]::WriteAllText($x.path,$v,[Text.UTF8Encoding]::new($false))}else{$s=ConvertTo-SecureString ([IO.File]::ReadAllText($x.path));$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}}`;
export class Vault{
 constructor(root){this.root=path.join(root,'credentials');fs.mkdirSync(this.root,{recursive:true});}
 file(ref){if(!/^stored:[a-zA-Z0-9_-]{1,100}$/.test(ref))throw Error('Invalid stored credential');return path.join(this.root,ref.slice(7)+'.dpapi');}
 has(ref){if(!ref)return false;if(/^env:[a-zA-Z0-9_]{1,100}$/.test(ref))return !!process.env[ref.slice(4)];return fs.existsSync(this.file(ref));}
 invoke(input){const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:JSON.stringify(input),encoding:'utf8',windowsHide:true,maxBuffer:100000,timeout:15000});if(r.status!==0)throw Error('本机加密凭证操作失败');return r.stdout.trim();}
 set(ref,value){if(typeof value!=='string'||value.length<1||value.length>16000||/[\r\n]/.test(value))throw Error('凭证格式无效');this.invoke({op:'set',path:this.file(ref),value});}
 get(ref){if(ref.startsWith('env:')){if(!this.has(ref))throw Error('环境变量凭证未配置');return process.env[ref.slice(4)];}if(!this.has(ref))throw Error('凭证未配置');return this.invoke({op:'get',path:this.file(ref)});}
 clear(ref){if(ref.startsWith('env:'))throw Error('仅可取消环境变量绑定，不能删除系统环境变量');fs.rmSync(this.file(ref),{force:true});}
}
