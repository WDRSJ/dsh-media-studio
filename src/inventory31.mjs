import fs from 'node:fs';
import path from 'node:path';
import {workflowAdmin} from './workflows3.mjs';
import {loadSettings3} from './policy3.mjs';
import {ConnectionStore} from './connections.mjs';

const kinds = new Set(['image', 'video', 'music', 'speech', 'audio']);
const archOf = (name = '', loader = '', type = '') => {
  const text = String(name + ' ' + loader);
  if (/z[-_ ]?image/i.test(text)) return 'z-image';
  if (/moss/i.test(text)) return 'moss';
  if (/wan ?2(?:\.2|_2|2)|wan2_2/i.test(text)) return 'wan2.2';
  if (/ace[-_ ]?step/i.test(text)) return 'ace-step';
  if (/flux/i.test(text)) return 'flux';
  if (/sdxl|stable[-_ ]?diffusion[-_ ]?xl/i.test(text)) return 'sdxl';
  if (/sd[-_ ]?1[._-]?5|stable[-_ ]?diffusion[-_ ]?1[._-]?5/i.test(text)) return 'sd1.5';
  if (/control[-_ ]?net/i.test(text) || type === 'controlnet') return 'controlnet';
  if (/lora/i.test(text) || type === 'lora') return 'lora';
  if (/vae/i.test(text) || type === 'vae') return 'vae';
  if (/t5|clip|text[-_ ]?encoder/i.test(text) || type === 'text-encoder') return 'text-encoder';
  return 'other';
};
const modelKind = (type, arch) => {
  if (arch === 'wan2.2') return ['video'];
  if (arch === 'ace-step') return ['music', 'audio'];
  if (arch === 'moss' || arch === 'z-image' || arch === 'flux' || arch === 'sdxl' || arch === 'sd1.5' || arch === 'controlnet' || arch === 'lora' || arch === 'vae') return ['image'];
  if (arch === 'text-encoder') return ['image', 'video'];
  return [];
};
function jobsFor(root) {
  const dir = path.join(root, 'workflows3/jobs');
  const rows = [];
  if (!fs.existsSync(dir)) return rows;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const job = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      const verified = job.status === 'completed' && (job.files || []).some(f => f?.verification?.verified === true);
      rows.push({id: job.id, templateId: job.templateId || null, kind: job.kind || null, status: job.status, promptId: job.promptId || null, verified, at: job.modified || job.createdAt || job.startedAt || null, sync: job.sync || null});
    } catch { /* a corrupt receipt is not evidence of success */ }
  }
  return rows;
}
function cloudRows(root) {
  try {
    const value = new ConnectionStore(root).load().value;
    return {
      configured: (value.connections || []).filter(c => c.enabled !== false).map(c => ({id: c.id, label: c.label || c.providerId, providerId: c.providerId, kinds: c.kinds || [], enabled: c.enabled !== false})),
      note: '仅列出已保存连接，不调用供应商，不证明在线、权限或计费；实际云端生成仍需原聊天授权。'
    };
  } catch (e) {
    return {configured: [], note: '未读取到云端连接配置：' + e.message};
  }
}
export async function inventory31(root, options = {}) {
  const discovery = await workflowAdmin(root, {action: 'discover'});
  const rows = Array.isArray(discovery) ? discovery : [];
  const listed = await workflowAdmin(root, {action: 'list'});
  const templates = listed.templates || [];
  const instances = rows.map(i => ({
    id: i.id, label: i.label || '', displayLabel: i.displayLabel || i.label || i.id,
    local: i.local === true, enabled: i.enabled !== false,
    state: i.state || (i.available ? 'connected' : 'unknown'),
    available: i.available === true, version: i.version || null,
    nodeCount: i.nodeCount || 0, checkedAt: i.checkedAt || null,
    message: i.message || null,
    modelCount: Array.isArray(i.models) ? i.models.length : 0,
    capabilities: [...new Set((i.models || []).flatMap(m => modelKind(m.type, archOf(m.name, m.loader, m.type))))].sort()
  }));
  const models = [];
  for (const i of rows) {
    for (const m of i.models || []) {
      const arch = archOf(m.name, m.loader, m.type);
      models.push({
        instanceId: i.id, instance: i.displayLabel || i.label || i.id,
        name: m.name, type: m.type, loader: m.loader, input: m.input,
        architecture: arch, kinds: modelKind(m.type, arch),
        visible: m.available === true,
        metadataStatus: m.metadataStatus || '仅实例报告；大小、许可证和硬件要求未核实',
        license: m.license || null, bytes: m.bytes ?? null, source: m.source || null
      });
    }
  }
  const jobs = jobsFor(root);
  const workflows = templates.map(t => {
    const verified = jobs.filter(j => j.templateId === t.id && j.verified);
    return {
      id: t.id, name: t.name, displayName: t.displayName || t.name || t.id,
      kind: t.kind, version: t.version || 1, enabled: t.enabled === true,
      status: t.status || t.availability?.status || (t.graph ? 'ready' : 'needs-binding'),
      source: t.source || null, instanceId: t.instanceId || null,
      sourceFile: t.sourceFile || t.comfySync?.sourceFile || null,
      technicalType: t.technicalType || null,
      outputSelection53: t.outputSelection53 || [],
      mappings: Object.keys(t.mappings || {}).length,
      diagnostics: t.diagnostics || [],
      verified: verified.length > 0,
      verifiedJobs: verified.slice(-3).map(j => ({id: j.id, at: j.at, promptId: j.promptId, kind: j.kind})),
      dependencies: t.dependencies || {nodes: [], modelFields: []}
    };
  });
  const cloud = cloudRows(root);
  const architectures = [...new Set(models.map(m => m.architecture).filter(a => a !== 'other'))].sort();
  const kindsFound = [...new Set(workflows.filter(w => kinds.has(w.kind)).map(w => w.kind))].sort();
  return {
    generatedAt: new Date().toISOString(),
    instances,
    models,
    workflows,
    cloud,
    summary: {
      instances: instances.length,
      availableInstances: instances.filter(i => i.available && i.enabled).length,
      models: models.length,
      architectures,
      workflows: workflows.length,
      readyWorkflows: workflows.filter(w => w.status === 'ready').length,
      verifiedWorkflows: workflows.filter(w => w.verified).length,
      realVerifiedJobs: jobs.filter(j => j.verified).length,
      kinds: kindsFound
    },
    states: {
      visible: '实例加载器报告了该资源名',
      dependencySatisfied: '所属工作流执行图的全部节点/资源已静态检查',
      staticallyExecutable: '工作流保存了图且状态为 ready，仍不等于真实推理',
      realVerified: '存在 completed 回执且产物经 FFmpeg 解码'
    },
    refresh: options.refresh === true ? 'fresh' : 'fresh',
    note: '本清单来自当前实例 /object_info 与工作流库；没有扫描整块磁盘。未连接的实例只显示已保存配置，不代表本机没有模型。'
  };
}
