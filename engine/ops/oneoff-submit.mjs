import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {MediaStore, policySchema} from '../core.mjs';

const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const equalPolicy = (a, b) => JSON.stringify(policySchema.parse(a)) === JSON.stringify(policySchema.parse(b));

function confirmReceipt(receipt, id, hash, maxCNY) {
  if (!receipt || receipt.source !== 'DSH in-chat human confirmation' || receipt.id !== id || receipt.hash !== hash || receipt.reservedCNY !== maxCNY) {
    throw Error('本次请求缺少匹配的本机人工确认记录；未提交。');
  }
  const time = Date.parse(receipt.at);
  if (!Number.isFinite(time) || time > Date.now() + 60000 || Date.now() - time > 5 * 60000) throw Error('人工确认已过期，请重新审阅。');
  return {at: receipt.at, source: receipt.source, id, hash, reservedCNY: maxCNY, scope: 'One exact media request; no automatic retry'};
}

/**
 * Called only by the interactive human UI after it displays and confirms a request.
 * This is a workflow boundary, not protection against code running as this user.
 * The production policy is never written. A separate MediaStore reads a private
 * snapshot, while production MCP continues to read the locked production policy.
 */
export async function submitOneoff({store, id, hash, maxCNY, expectedPolicy, oneoffDir, receipt}) {
  if (!(store instanceof MediaStore)) throw Error('Expected the local MediaStore');
  if (!/^[a-f0-9]{64}$/.test(hash || '')) throw Error('审阅请求哈希无效。');
  if (!Number.isFinite(maxCNY) || maxCNY <= 0 || maxCNY > 100) throw Error('本入口单次预留须大于0且不超过100元。');
  const confirmed = confirmReceipt(receipt, id, hash, maxCNY);
  const reviewed = store.get(id);
  if (reviewed.status !== 'draft') throw Error('请求已不再是草稿；禁止重复提交。');
  if (reviewed.hash !== hash || digest(reviewed.plan) !== hash) throw Error('请求与已审阅内容不一致；未提交。');
  const before = store.policy();
  if (expectedPolicy && !equalPolicy(before, expectedPolicy)) throw Error('配置在审阅期间改变，请重新审阅。');
  if (before.paidGenerationEnabled) throw Error('请先关闭常驻付费开关，再使用单次审批入口。');
  if (before.perRequestBudgetCNY > 0 && maxCNY > before.perRequestBudgetCNY) throw Error('超过已经设置的单次预算。');
  if (before.monthlyBudgetCNY > 0 && store.reserved() + maxCNY > before.monthlyBudgetCNY) throw Error('超过已经设置的月度预算。');
  if (reviewed.plan.estimateCNY === null || maxCNY < reviewed.plan.estimateCNY) throw Error('本次预留不足以覆盖估算金额。');
  const enabled = policySchema.parse({...before, paidGenerationEnabled: true,
    monthlyBudgetCNY: before.monthlyBudgetCNY || store.reserved() + maxCNY,
    perRequestBudgetCNY: before.perRequestBudgetCNY || maxCNY});
  const blockers = store.blockers(reviewed.plan, enabled);
  if (blockers.length) throw Error('还不能生成：' + blockers.join('; '));

  const directory = path.resolve(oneoffDir || path.join(path.dirname(store.policyPath), 'ops', 'oneoff-policies'));
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  // One request cannot be concurrently approved by two human windows. An
  // interrupted process leaves an inspectable lock; never silently reclaim it.
  const lockDirectory = path.join(store.dataDir, 'oneoff-locks');
  fs.mkdirSync(lockDirectory, {recursive: true, mode: 0o700});
  const lockPath = path.join(lockDirectory, id + '.lock');
  let lock;
  try { lock = fs.openSync(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw Error('这个请求已有人工提交窗口或中断记录，请先检查状态，禁止重复提交。'); throw error; }
  const privatePolicyPath = path.join(directory, id + '-' + randomUUID() + '.policy.json');
  const receiptPath = privatePolicyPath.replace(/\.policy\.json$/, '.receipt.json');
  let isolated, approvedByUs = false, result, failure;
  try {
    fs.writeFileSync(lock, JSON.stringify({pid: process.pid, id, startedAt: new Date().toISOString(), privatePolicyPath}));
    if (!equalPolicy(store.policy(), before)) throw Error('配置在审阅期间改变，请重新审阅。');
    if (store.get(id).status !== 'draft' || store.get(id).hash !== hash) throw Error('请求状态在审阅期间改变。');
    fs.writeFileSync(privatePolicyPath, JSON.stringify(enabled, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    fs.writeFileSync(receiptPath, JSON.stringify({...confirmed, policySource: path.resolve(store.policyPath), sourcePolicySha256: digest(fs.readFileSync(store.policyPath, 'utf8'))}, null, 2), {flag: 'wx', mode: 0o600});
    isolated = new MediaStore({dataDir: store.dataDir, policyPath: privatePolicyPath,
      routingPath: store.routingPath, transport: store.transport, downloadTransport: store.downloadTransport,
      keyResolver: store.keyResolver, tencentTransport: store.tencentTransport});
    if (!equalPolicy(store.policy(), before)) throw Error('配置在审阅期间改变，请重新审阅。');
    isolated.audit(id, 'local-human-confirmation', {receiptFile: receiptPath, hash, reservedCNY: maxCNY});
    isolated.approve(id, maxCNY);
    approvedByUs = true;
    result = await isolated.execute(id);
    if (result.status === 'completed' && !result.files.length) result = await isolated.download(id);
  } catch (error) { failure = error; }
  finally {
    const cleanupErrors = [];
    try {
      if (isolated && approvedByUs) {
        const current = isolated.get(id);
        if (current.status === 'approved' && current.policy_hash === digest(enabled)) isolated.revoke(id);
      }
    } catch (error) { cleanupErrors.push(error); }
    try {
      if (fs.existsSync(privatePolicyPath)) fs.writeFileSync(privatePolicyPath, JSON.stringify({...enabled, paidGenerationEnabled: false}, null, 2) + '\n', {mode: 0o600});
    } catch (error) { cleanupErrors.push(error); }
    try { isolated?.close(); } catch (error) { cleanupErrors.push(error); }
    try { fs.closeSync(lock); } catch (error) { cleanupErrors.push(error); }
    try { fs.unlinkSync(lockPath); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) failure = new AggregateError([...(failure ? [failure] : []), ...cleanupErrors], '请求结束时的本地清理未全部完成；生产付费策略未被修改，请检查该请求状态。');
  }
  if (failure) throw failure;
  return {request: result, privatePolicyPath, receiptPath};
}
