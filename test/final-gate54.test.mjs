import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Runtime} from '../src/runtime.mjs';
import {auditFinalFile54, technicalType54, verifierAvailable54} from '../src/final-gate54.mjs';

const binary = process.env.DSH_FFMPEG_PATH || 'ffmpeg';
const insertTask = (runtime, id, kind, status = 'approved', files = []) => {
  const plan = {input: {kind, prompt: 'fixture'}, connection: {providerId: 'fixture', label: 'fixture'}, model: 'fixture-model', estimate: 0};
  runtime.db.prepare('INSERT INTO tasks(id,owner,created,plan,status,files) VALUES(?,?,?,?,?,?)').run(id, 'owner', new Date().toISOString(), JSON.stringify(plan), status, JSON.stringify(files));
};
const makePng = file => execFileSync(binary, ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x24', '-frames:v', '1', file]);
const makeWav = file => execFileSync(binary, ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '1', '-f', 'wav', file]);
const withTemp = async (name, fn) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name)), prior = process.env.DSH_FFMPEG_PATH;
  const box = {runtime: null};
  try { await fn(root, box); }
  finally {
    try { box.runtime?.close(); } catch {}
    if (prior === undefined) delete process.env.DSH_FFMPEG_PATH; else process.env.DSH_FFMPEG_PATH = prior;
    fs.rmSync(root, {recursive: true, force: true});
  }
};

test('standalone cloud completion is proven by real FFmpeg decode, not by magic bytes or extension', async () => {
  await withTemp('final54-', async (root, box) => {
    process.env.DSH_FFMPEG_PATH = binary;
    makePng(path.join(root, 'good.png'));
    const runtime = box.runtime = new Runtime(root, {vault: {has: () => false}, transport: async () => { throw Error('no network in fixture'); }});
    insertTask(runtime, 'real-image', 'image');
    await runtime.completeBytes('real-image', fs.readFileSync(path.join(root, 'good.png')), 'image');
    const row = runtime.row('real-image', 'owner');
    assert.equal(row.status, 'completed');
    assert.equal(row.files[0].verification.verified, true);
    assert.equal(row.files[0].verification.technicalType, 'image');
    assert.equal(row.files[0].verification.width, 32);
    const view = await runtime.ensureFinal54('real-image', 'owner');
    assert.equal(view.status, 'completed');
    assert.equal(runtime.row('real-image', 'owner').files[0].verification.verified, true);
  });
});

test('wrong provider type is failed-validation and never completed; the bytes stay recoverable for audit', async () => {
  await withTemp('final54-', async (root, box) => {
    process.env.DSH_FFMPEG_PATH = binary;
    makeWav(path.join(root, 'wrong.wav'));
    const runtime = box.runtime = new Runtime(root, {vault: {has: () => false}});
    insertTask(runtime, 'wrong-image', 'image');
    await assert.rejects(runtime.completeBytes('wrong-image', fs.readFileSync(path.join(root, 'wrong.wav')), 'image'), /最终产物验证失败/);
    const row = runtime.row('wrong-image', 'owner');
    assert.equal(row.status, 'validation-failed');
    assert.equal(row.files[0].verification.verified, false);
    assert.ok(fs.existsSync(row.files[0].path));
  });
});

test('music/speech are verified as audio containers; an unknown declared kind fails closed', async () => {
  await withTemp('final54-', async (root, box) => {
    process.env.DSH_FFMPEG_PATH = binary;
    makeWav(path.join(root, 'tone.wav'));
    const bytes = fs.readFileSync(path.join(root, 'tone.wav'));
    assert.equal(technicalType54('music'), 'audio');
    assert.equal(technicalType54('speech'), 'audio');
    assert.equal(technicalType54('video'), 'video');
    const runtime = box.runtime = new Runtime(root, {vault: {has: () => false}});
    insertTask(runtime, 'music', 'music');
    await runtime.completeBytes('music', bytes, 'music');
    assert.equal(runtime.row('music', 'owner').files[0].verification.technicalType, 'audio');
    insertTask(runtime, 'unknown', 'podcast');
    await assert.rejects(runtime.completeBytes('unknown', bytes, 'podcast'), /未知媒体类别/);
    assert.equal(runtime.row('unknown', 'owner').status, 'validation-failed');
  });
});

test('without an existing FFmpeg the task is never claimed as verified; delivery-ready audit refuses it', async () => {
  await withTemp('final54-', async (root, box) => {
    delete process.env.DSH_FFMPEG_PATH;
    assert.equal(verifierAvailable54(root).available, false);
    const runtime = box.runtime = new Runtime(root, {vault: {has: () => false}});
    insertTask(runtime, 'unverified', 'image');
    await runtime.completeBytes('unverified', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, ...Buffer.alloc(64)]), 'image');
    const row = runtime.row('unverified', 'owner');
    assert.equal(row.status, 'completed');
    assert.equal(row.files[0].verification.verified, false);
    assert.equal(row.files[0].verification.state, 'verification-required');
    await assert.rejects(runtime.ensureFinal54('unverified', 'owner'), e => e.code === 'FINAL_VERIFICATION_REQUIRED');
  });
});

test('legacy completed receipts are audited on demand and migrated without re-generating or deleting them', async () => {
  await withTemp('final54-', async (root, box) => {
    process.env.DSH_FFMPEG_PATH = binary;
    makePng(path.join(root, 'legacy.png'));
    const good = path.join(root, 'legacy.png'), bad = path.join(root, 'legacy-bad.png');
    makeWav(bad);
    const runtime = box.runtime = new Runtime(root, {vault: {has: () => false}});
    insertTask(runtime, 'legacy-good', 'image', 'completed', [{path: good, bytes: fs.statSync(good).size}]);
    const view = await runtime.ensureFinal54('legacy-good', 'owner');
    assert.equal(view.status, 'completed');
    assert.equal(runtime.row('legacy-good', 'owner').files[0].verification.verified, true);
    insertTask(runtime, 'legacy-bad', 'image', 'completed', [{path: bad, bytes: fs.statSync(bad).size}]);
    await assert.rejects(runtime.ensureFinal54('legacy-bad', 'owner'), /验证失败/);
    assert.equal(runtime.row('legacy-bad', 'owner').status, 'validation-failed');
    assert.ok(fs.existsSync(bad));
    const audit = await auditFinalFile54(root, good, 'image');
    assert.equal(audit.state, 'passed');
  });
});

test('formats FFmpeg can decode but outputFormat cannot name are archived intact, and deleted verified files are re-audited', async () => {
  await withTemp('final54-', async (root, box) => {
    process.env.DSH_FFMPEG_PATH = binary;
    execFileSync(binary, ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=16x16:r=5', '-t', '1', '-c:v', 'libvpx', '-b:v', '80k', path.join(root, 'v.webm')]);
    execFileSync(binary, ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '1', '-f', 'flac', path.join(root, 'a.flac')]);
    const runtime = box.runtime = new Runtime(root, {vault: {has: () => false}});
    insertTask(runtime, 'webm', 'video');
    await runtime.completeBytes('webm', fs.readFileSync(path.join(root, 'v.webm')), 'video');
    const video = runtime.row('webm', 'owner');
    assert.equal(video.status, 'completed');
    assert.equal(video.files[0].verification.verified, true);
    assert.ok(fs.existsSync(video.files[0].path), 'WebM artifact must survive completion');
    assert.match(video.files[0].path, /\.webm$/);
    insertTask(runtime, 'flac', 'audio');
    await runtime.completeBytes('flac', fs.readFileSync(path.join(root, 'a.flac')), 'audio');
    const audio = runtime.row('flac', 'owner');
    assert.equal(audio.status, 'completed');
    assert.equal(audio.files[0].verification.verified, true);
    assert.ok(fs.existsSync(audio.files[0].path), 'FLAC artifact must survive completion');
    assert.match(audio.files[0].path, /\.flac$/);
    fs.rmSync(video.files[0].path);
    await assert.rejects(runtime.ensureFinal54('webm', 'owner'), /缺失|验证失败/);
    assert.equal(runtime.row('webm', 'owner').status, 'validation-failed');
  });
});
