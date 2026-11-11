import fs from'node:fs';import path from'node:path';import os from'node:os';import{createHash}from'node:crypto';
// Observe the installed daily package only. Never infer deployment from source,
// Git tags, yesterday's progress, or the candidate currently being packaged.
export function deploymentState31(packagePath=path.join(os.homedir(),'.dsh/profiles/desktop/node_modules/@local/dsh-media-studio/package.json')){
 const observedAt=new Date().toISOString();if(!fs.existsSync(packagePath))return{version:null,source:'unverified',observedAt,reason:'Daily plugin package not found; no version assumed'};
 const bytes=fs.readFileSync(packagePath),p=JSON.parse(bytes);if(p.name!=='@local/dsh-media-studio'||typeof p.version!=='string'||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(p.version))throw Error('Invalid daily Media Studio package metadata');
 return{version:p.version,source:'installed-package',packagePath:path.resolve(packagePath),sha256:createHash('sha256').update(bytes).digest('hex'),observedAt,scope:'Installed package version only; not a live runtime or data-compatibility guarantee'};
}
