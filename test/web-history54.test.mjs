import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Runtime} from '../src/runtime.mjs';
import {history3} from '../src/history3.mjs';

const binary = process.env.DSH_FFMPEG_PATH || 'ffmpeg';
const insertTask = (runtime, id, kind = 'image', status = 'approved') => {
  const plan = {input: {kind, prompt: 'history fixture'}, connection: {providerId: 'fixture', label: 'fixture'}, model: 'fixture-model', estimate: 0};
  runtime.db.prepare('INSERT INTO tasks(id,owner,created,plan,status,files) VALUES(?,?,?,?,?,?)').run(id, 'owner', new Date().toISOString(), JSON.stringify(plan), status, '[]');
};

test('failed final verification is visible in history after save/reopen; refresh is stable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webhistory54-')), prior = process.env.DSH_FFMPEG_PATH;
  try {
    process.env.DSH_FFMPEG_PATH = binary;
    execFileSync(binary, ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '1', '-f', 'wav', path.join(root, 'wrong.wav')]);
    const wrong = fs.readFileSync(path.join(root, 'wrong.wav'));
    const first = new Runtime(root, {vault: {has: () => false}});
    insertTask(first, 'bad-image', 'image');
    await assert.rejects(first.completeBytes('bad-image', wrong, 'image'), /最终产物验证失败/);
    first.close();
    // Reopen as a new process would: persisted DB + files must still report the error.
    const second = new Runtime(root, {vault: {has: () => false}});
    const history = history3(root);
    const entry = history.find(x => x.type === 'cloud' && x.id === 'bad-image');
    assert.ok(entry, 'cloud task must appear in history');
    assert.equal(entry.status, 'validation-failed');
    assert.equal(entry.verificationState, 'validation-failed');
    assert.match(entry.error, /最终产物验证失败/);
    assert.deepEqual(history3(root).filter(x => x.id === 'bad-image'), [entry]);
    assert.equal(second.row('bad-image', 'owner').status, 'validation-failed');
    second.close();
  } finally {
    if (prior === undefined) delete process.env.DSH_FFMPEG_PATH; else process.env.DSH_FFMPEG_PATH = prior;
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('legacy workflow receipt awaiting output review is shown as validation-required with its reason', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'webhistory54-'));
  try {
    const dir = path.join(root, 'workflows3/jobs'); fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'legacy.json'), JSON.stringify({
      id: 'legacy', owner: 'owner', status: 'completed', kind: 'image', created: '2026-11-08T00:00:00.000Z',
      contractAudit53: {state: 'pending', reason: '原任务输出契约待验证'}, validationError: '原任务输出契约待验证：未知输出节点',
      files: [{path: path.join(dir, 'x.png'), sha256: '0'.repeat(64)}],
    }));
    const entry = history3(root).find(x => x.type === 'workflow' && x.id === 'legacy');
    assert.equal(entry.status, 'validation-required');
    assert.equal(entry.verificationState, 'validation-required');
    assert.match(entry.error, /未知输出节点/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('Web history labels include the final verification states so the UI does not show a raw code', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'ui/client.js'), 'utf8');
  for (const token of ["'validation-failed':'产物验证失败'", "'verification-required':'产物待验证'", "'validation-required':'产物待验证'", "mediaStudio.lastInstanceId","'validation-failed':'产物验证失败'","错误：'","windows-tts","读取本机系统语音","perform(async()=>{const r=await api({action:'ttsVoices'})","r.result?.voices","neural-tts","读取神经 TTS 声音"]) assert.ok(source.includes(token), token);
});
