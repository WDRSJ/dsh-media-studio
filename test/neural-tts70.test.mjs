import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {neuralTtsCapabilities, synthesizeNeuralTTS} from '../src/neural-tts31.mjs';
import {validatePipeline} from '../src/pipeline3.mjs';

const saved = {bin: process.env.DSH_PIPER_BIN, dir: process.env.DSH_PIPER_MODEL_DIR};
const localBin = process.env.DSH_PIPER_BIN || '';
const localDir = process.env.DSH_PIPER_MODEL_DIR || '';
const realBin = saved.bin || (fs.existsSync(localBin) ? localBin : undefined);
const realDir = saved.dir || (fs.existsSync(localDir) ? localDir : undefined);

test('missing Piper configuration fails clearly instead of silently using SAPI', async () => {
  delete process.env.DSH_PIPER_BIN;
  delete process.env.DSH_PIPER_MODEL_DIR;
  assert.equal(neuralTtsCapabilities().configured, false);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-tts-'));
  try {
    await assert.rejects(synthesizeNeuralTTS(root, {text: '测试', language: 'zh-CN'}), /未配置本地神经 TTS/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('neural-tts validates its own parameters without falling back to Windows SAPI', () => {
  assert.doesNotThrow(() => validatePipeline([{id: 'speech', executor: 'neural-tts', params: {text: '你好', language: 'zh-CN', rate: 0.5}}]));
  assert.throws(() => validatePipeline([{id: 'speech', executor: 'neural-tts', params: {text: 'x'.repeat(2001)}}]), /1–2000/);
  assert.throws(() => validatePipeline([{id: 'speech', executor: 'neural-tts', params: {text: '你好', rate: 3}}]), /-2–2/);
});

test('real Piper synthesis works when explicitly configured', {skip: !realBin || !realDir}, async () => {
  process.env.DSH_PIPER_BIN = realBin;
  process.env.DSH_PIPER_MODEL_DIR = realDir;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neural-tts-real-'));
  const priorFfmpeg = process.env.DSH_FFMPEG_PATH;
  process.env.DSH_FFMPEG_PATH = process.env.DSH_FFMPEG_PATH || 'ffmpeg';
  try {
    const r = await synthesizeNeuralTTS(root, {text: '本地神经语音测试。', language: 'zh-CN'});
    assert.equal(r.verification.verified, true);
    assert.equal(r.verification.technicalType, 'audio');
    assert.match(r.voice, /huayan/);
    assert.equal(r.purposeEvidence.source, 'piper-tts');
    assert.ok(r.verification.duration > 0.5);
  } finally {
    if (priorFfmpeg === undefined) delete process.env.DSH_FFMPEG_PATH; else process.env.DSH_FFMPEG_PATH = priorFfmpeg;
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test.after(() => {
  if (saved.bin === undefined) delete process.env.DSH_PIPER_BIN; else process.env.DSH_PIPER_BIN = saved.bin;
  if (saved.dir === undefined) delete process.env.DSH_PIPER_MODEL_DIR; else process.env.DSH_PIPER_MODEL_DIR = saved.dir;
});
