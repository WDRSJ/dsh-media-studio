import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {atomicJSON} from './policy3.mjs';
import {inputBinding53} from './media-inputs53.mjs';
import {classifyMediaBytes54, mediaKindLabel54, mediaLimits54} from './media-transfer54.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const inside = (root, file) => {const base = fs.realpathSync(root), real = fs.realpathSync(file), relative = path.relative(base, real); if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('素材不在工作室归档目录'); return real;};
const technicalKind = kind => ['music', 'speech'].includes(kind) ? 'audio' : kind;
const mediaKinds54 = new Set(['image', 'video', 'audio']);

// studio:// references are read-only, owner/hash/kind bound. The same format is
// used for completed workflow receipts and pipeline stage outputs. Video/audio
// artifacts must already carry a passed final verification before reuse.
export function studioMedia31(root, reference, owner, {kind = 'image'} = {}) {
  if (!String(reference || '').startsWith('studio://')) return null;
  if (!mediaKinds54.has(kind)) throw Error('未知素材类别 ' + String(kind));
  const label = mediaKindLabel54(kind);
  const m = /^studio:\/\/(workflow|pipeline)\/([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9_-]{1,100})$/.exec(reference);
  if (!m || !owner) throw Error('归档素材标识无效');
  let artifact, verification;
  if (m[1] === 'workflow') {
    if (!/^\d{1,2}$/.test(m[3])) throw Error('素材编号无效');
    const receipt = JSON.parse(fs.readFileSync(inside(root, path.join(root, 'workflows3/jobs', m[2] + '.json'))));
    if (receipt.owner !== owner || receipt.status !== 'completed') throw Error('只能引用本会话已完成的' + label);
    if (technicalKind(receipt.kind || 'image') !== kind) throw Error('只能引用本会话已完成的' + label);
    artifact = receipt.files?.[Number(m[3])];
    verification = artifact?.verification;
  } else {
    const db = new DatabaseSync(inside(root, path.join(root, 'pipelines-v3/jobs.sqlite')), {readOnly: true});
    try {
      const row = db.prepare('SELECT plan FROM jobs WHERE id=? AND owner=?').get(m[2], owner);
      if (!row) throw Error('素材不属于此会话');
      const stage = JSON.parse(row.plan).stages.find(s => s.id === m[3]);
      if (!stage || stage.state !== 'completed' || technicalKind(stage.output?.kind) !== kind) throw Error('只能引用已完成' + label + '阶段');
      artifact = {path: stage.output.file, sha256: stage.output.sha256};
      verification = stage.output.verification;
    } finally { db.close(); }
  }
  if (!artifact?.path || !/^[a-f0-9]{64}$/.test(artifact.sha256 || '')) throw Error('素材缺少可信归档校验');
  const file = inside(root, artifact.path), size = fs.statSync(file).size;
  const limit = mediaLimits54[kind];
  if (!size || size > limit) throw Error('参考' + label + '需在' + (limit / 1024 / 1024) + 'MB以内');
  if (verification && verification.verified !== true) throw Error('上游' + label + '尚未通过最终验证，拒绝作为素材');
  if (kind !== 'image' && verification?.verified !== true) throw Error('上游' + label + '缺少最终验证证据，拒绝作为素材');
  const bytes = fs.readFileSync(file);
  if (hash(bytes) !== artifact.sha256) throw Error('参考素材归档已变化，拒绝使用');
  const classified = classifyMediaBytes54(bytes, kind);
  return {reference, file, sha256: artifact.sha256, bytes: size, kind, ext: classified.ext};
}

export function studioImage31(root, reference, owner) {
  return studioMedia31(root, reference, owner, {kind: 'image'});
}

export function imageBinding31(template) {
  return inputBinding53(template, 'image');
}

export function mediaBinding54(template, kind) {
  return inputBinding53(template, kind);
}

// One upload receipt per owner+callId. The fingerprint includes the media kind
// and route so a retry cannot silently upload different bytes or to another
// instance; a changed route refuses instead of switching instance.
export async function bindStudioMedia31(root, input, owner, callId, route, upload, {kind = 'image'} = {}) {
  const fresh = studioMedia31(root, input.reference, owner, {kind});
  if (fresh.sha256 !== input.sha256) throw Error('规划后素材变化，未上传');
  const fingerprint = hash(JSON.stringify({source: fresh.sha256, kind, ...route})), dir = path.join(root, 'input-bindings31');
  fs.mkdirSync(dir, {recursive: true});
  const file = callId ? path.join(dir, hash(owner + '\0' + callId + (route.alias ? '\0' + route.alias : '')) + '.json') : null;
  if (file && fs.existsSync(file)) {
    const row = JSON.parse(fs.readFileSync(file));
    if (row.fingerprint !== fingerprint) throw Error('同一请求的素材或执行路线变化，未上传');
    if (row.status !== 'ready') throw Error('原素材上传回执待核对，未重复上传或生成');
    if (typeof row.image !== 'string' || !row.image || row.image.length > 300 || /(^[/\\]|\.\.|:|[\x00-\x1f])/.test(row.image)) throw Error('原素材上传回执无效');
    return row.image;
  }
  if (file) try { fs.writeFileSync(file, JSON.stringify({fingerprint, status: 'uploading'}), {flag: 'wx'}); } catch (e) { if (e.code === 'EEXIST') throw Error('原素材上传正在处理，未重复上传'); throw e; }
  try {
    const bytes = fs.readFileSync(fresh.file);
    if (hash(bytes) !== fresh.sha256) throw Error('上传前素材变化，未传输');
    const result = await upload(bytes.toString('base64'), kind);
    if (result.sha256 !== fresh.sha256 || typeof result.image !== 'string' || !result.image || result.image.length > 300 || /(^[/\\]|\.\.|:|[\x00-\x1f])/.test(result.image)) throw Error('素材上传回执不匹配');
    if (result.kind && result.kind !== kind) throw Error('素材上传回执类型不匹配');
    if (file) atomicJSON(file, {fingerprint, status: 'ready', image: result.image});
    return result.image;
  } catch (e) {
    if (file) atomicJSON(file, {fingerprint, status: 'uncertain'});
    throw e;
  }
}

export function bindStudioImage31(root, input, owner, callId, route, upload) {
  return bindStudioMedia31(root, input, owner, callId, route, async b64 => upload(b64), {kind: 'image'});
}
