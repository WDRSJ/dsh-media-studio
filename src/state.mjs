import fs from'node:fs';import path from'node:path';
export const credentialNames=['ARK_API_KEY','MINIMAX_API_KEY','DASHSCOPE_API_KEY','TENCENTCLOUD_SECRET_ID','TENCENTCLOUD_SECRET_KEY','SILICONFLOW_API_KEY'];
export function readState(root,settings){return {...settings,backendRoot:root,approvalEntry:path.join(root,'确认媒体生成.cmd'),siliconflowKeyEntry:path.join(root,'保存硅基流动密钥.cmd'),credentials:Object.fromEntries(credentialNames.map(n=>[n,!!process.env[n]||fs.existsSync(path.join(root,'media/secrets',n+'.dpapi'))]))};}
