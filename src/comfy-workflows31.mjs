import {createHash} from 'node:crypto';

// Adapter for ComfyUI's official userdata file API. The caller supplies a
// transport (authenticated, size/redirect bounded) so credentials and instance
// authority stay in workflows3.
export function safeRemoteFile(file) {
  if (typeof file !== 'string' || !file.length || file.length > 300) throw Error('工作流文件路径无效');
  if (file.startsWith('/') || file.includes('\\') || file.includes('..') || /[\x00-\x1f]/.test(file)) throw Error('工作流文件路径不安全');
  const parts = file.split('/').filter(Boolean);
  if (!parts.length || parts.length > 12 || parts.some(p => p === '.' || p === '..')) throw Error('工作流文件路径无效');
  return parts.join('/');
}
function workflowPath(file) {
  const safe = safeRemoteFile(file);
  if (!/^workflows\/[^/].*\.json$/i.test(safe)) throw Error('userdata 路径必须位于 workflows/ 下');
  return safe;
}
export function workflowDigest(document) {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex');
}
export function remoteWorkflowName(id, version) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw Error('工作流 ID 不能用作 ComfyUI 文件名');
  if (!Number.isInteger(version) || version < 1) throw Error('工作流版本无效');
  return 'workflows/MediaStudio/' + id + '-v' + version + '.json';
}
function normalizeEntries(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.files) ? data.files : Array.isArray(data?.items) ? data.items : null;
  if (!rows) throw Error('ComfyUI 工作流列表返回格式不受支持');
  const out = [], seen = new Set();
  for (const row of rows) {
    const path = typeof row === 'string' ? row : row?.path || row?.name || row?.filename || row?.file;
    if (typeof path !== 'string' || !/\.json$/i.test(path)) continue;
    let relative;
    try { relative = safeRemoteFile(path); } catch { continue; }
    if (seen.has(relative)) continue;
    seen.add(relative);
    out.push({file: 'workflows/' + relative, name: relative.split('/').pop().replace(/\.json$/i, ''), dir: relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '', modified: row?.modified ?? row?.mtime ?? null, size: row?.size ?? row?.bytes ?? null, source: 'comfy-userdata'});
    if (out.length >= 1000) break;
  }
  return out;
}
export async function listRemoteWorkflows(transport) {
  const routes = [
    '/userdata?dir=workflows&recurse=true&split=false&full_info=true',
    '/v2/userdata?dir=workflows&recurse=true&split=false&full_info=true',
    '/userdata?dir=workflows&recurse=true&split=false',
    '/v2/userdata?dir=workflows&recurse=true&split=false'
  ];
  const tried = [];
  for (const route of routes) {
    let response;
    try { response = await transport.get(route); }
    catch (e) { tried.push({route, error: e.message}); if (e.httpStatus === 404 || e.definitive) continue; throw e; }
    try { return {route, files: normalizeEntries(response.data), tried}; }
    catch (e) { tried.push({route, error: e.message}); }
  }
  throw Error('目标 ComfyUI 未提供可读取的用户工作流目录接口；可改用一次性导入 JSON 文件（不谎称已读取全部工作流）。' + (tried.length ? ' 尝试：' + tried.map(x => x.route + ' ' + x.error).join('；') : ''));
}
export async function readRemoteWorkflow(transport, file) {
  const safe = workflowPath(file);
  const route = '/userdata/' + encodeURIComponent(safe);
  const response = await transport.get(route);
  let document = response.data;
  if (typeof document === 'string') {
    try { document = JSON.parse(document); } catch { throw Error('ComfyUI 工作流文件不是有效 JSON'); }
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw Error('ComfyUI 工作流文件内容不是 JSON 对象');
  const format = Array.isArray(document.nodes) && Array.isArray(document.links) ? 'comfy-editor' : 'comfy-api';
  return {file: safe, document, format, sha256: workflowDigest(document), bytes: response.bytes ?? null, modified: response.modified ?? null, route};
}
export async function saveRemoteWorkflow(transport, file, document, {overwrite = false} = {}) {
  const safe = workflowPath(file);
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw Error('需要有效的 ComfyUI 工作流 JSON');
  const route = '/userdata/' + encodeURIComponent(safe) + '?overwrite=' + (overwrite ? 'true' : 'false') + '&full_info=true';
  const body = JSON.stringify(document);
  const response = await transport.postRaw(route, body, 'application/json');
  return {file: safe, sha256: workflowDigest(document), overwrite, response: response.data, route};
}
export async function remoteWorkflowStatus(transport, file) {
  try {
    const row = await readRemoteWorkflow(transport, file);
    return {exists: true, ...row};
  } catch (e) {
    if (e.httpStatus === 404) return {exists: false, file};
    throw e;
  }
}
export function comfyWorkflowUrl(instanceUrl, file) {
  const base = String(instanceUrl).replace(/\/$/, '');
  // ComfyUI frontend versions differ in deep-link support. Return both a
  // conservative query URL and the exact userdata path so callers can fall back
  // to the native workflow browser instead of claiming the canvas was opened.
  return {url: base + '/?workflow=' + encodeURIComponent(file), fallbackUrl: base + '/', userdataUrl: base + '/userdata/' + encodeURIComponent(file), file};
}
