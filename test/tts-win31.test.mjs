import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {listWindowsVoices, synthesizeWindowsTTS} from '../src/tts-win31.mjs';
import {pipeline3} from '../src/pipeline3.mjs';
import {verifyMedia53} from '../src/media-verify53.mjs';

const binary = process.env.DSH_FFMPEG_PATH || 'ffmpeg';
const winOnly = {skip: process.platform !== 'win32'};

async function withTemp(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tts31-')), prior = process.env.DSH_FFMPEG_PATH;
  try { process.env.DSH_FFMPEG_PATH = binary; await fn(root); }
  finally { if (prior === undefined) delete process.env.DSH_FFMPEG_PATH; else process.env.DSH_FFMPEG_PATH = prior; fs.rmSync(root, {recursive: true, force: true}); }
}

test('Windows system TTS produces real verified audio and rejects unknown voices', winOnly, async () => {
  await withTemp(async root => {
    const voices = await listWindowsVoices();
    assert.ok(voices.length > 0);
    const zh = voices.find(v => v.culture === 'zh-CN');
    const result = await synthesizeWindowsTTS(root, {text: '本地语音测试。', language: 'zh-CN'});
    assert.ok(fs.existsSync(result.file));
    assert.equal(result.verification.verified, true);
    assert.equal(result.verification.technicalType, 'audio');
    assert.ok(result.verification.duration > 0.5);
    assert.equal(result.purposeEvidence.purpose, 'speech');
    if (zh) assert.equal(result.voice, zh.name);
    const second = await synthesizeWindowsTTS(root, {text: 'Second segment in English.', language: 'en-US'});
    assert.notEqual(result.sha256, second.sha256);
    await assert.rejects(synthesizeWindowsTTS(root, {text: 'bad voice', voice: 'No Such Voice'}), /未安装指定语音/);
    await assert.rejects(synthesizeWindowsTTS(root, {text: '   '}), /1–800/);
    await assert.rejects(synthesizeWindowsTTS(root, {text: 'x'.repeat(801)}), /1–800/);
  });
});

test('pipeline windows-tts stages archive verified speech and require purpose evidence', winOnly, async () => {
  await withTemp(async root => {
    const owner = 'tts-test-owner';
    const created = await pipeline3(root, {action: 'create', spec: [{id: 'segZh', executor: 'windows-tts', params: {text: '第一段。', language: 'zh-CN'}}, {id: 'segEn', executor: 'windows-tts', params: {text: 'Second.', language: 'en-US'}}]}, owner, {verify: verifyMedia53, authorize: async () => ({authorized: true})});
    const done = await pipeline3(root, {action: 'resume', id: created.id}, owner, {verify: verifyMedia53, authorize: async () => ({authorized: true})});
    assert.equal(done.state, 'completed');
    for (const stage of done.stages) {
      assert.equal(stage.output.kind, 'speech');
      assert.equal(stage.output.verification.technicalType, 'audio');
      assert.equal(stage.output.verification.verified, true);
      assert.equal(stage.output.purposeEvidence.purpose, 'speech');
      assert.ok(fs.existsSync(stage.output.file));
    }
    assert.notEqual(done.stages[0].output.sha256, done.stages[1].output.sha256);
  });
});
