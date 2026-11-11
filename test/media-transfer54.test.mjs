import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {workflowAdmin} from '../src/workflows3.mjs';
import {saveSettings3, loadSettings3} from '../src/policy3.mjs';
import {studioMedia31, studioImage31, bindStudioMedia31, mediaBinding54} from '../src/input31.mjs';
import {classifyMediaBytes54, validateWorkflowInput54, mediaLimits54} from '../src/media-transfer54.mjs';
import {validatePipeline} from '../src/pipeline3.mjs';

const binary = process.env.DSH_FFMPEG_PATH || 'ffmpeg';
const ff = args => execFileSync(binary, ['-nostdin', '-y', '-v', 'error', ...args]);
const sha = b => createHash('sha256').update(b).digest('hex');
const withServer = async handler => {
  const requests = [];
  const server = http.createServer((req, res) => handler(req, res, requests));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {url: 'http://127.0.0.1:' + port, requests, close: () => new Promise(resolve => server.close(resolve))};
};
const multipart = body => {
  const text = body.toString('latin1');
  const filename = /filename="([^"]+)"/.exec(text)?.[1] || null;
  const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'));
  const start = headerEnd + 4;
  let end = body.indexOf(Buffer.from('\r\n--'), start);
  if (end < 0) end = body.length;
  return {filename, bytes: body.subarray(start, end)};
};
const baseSettings = root => saveSettings3(root, {...loadSettings3(root), instances: [{id: 'local', url: 'http://127.0.0.1:1', trusted: true}]});

test('upload accepts image/video/audio with content-derived extension and exact bytes; remote is refused before any request', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transfer54-'));
  const prior = process.env.DSH_FFMPEG_PATH;
  const srv = await withServer((req, res, requests) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const {filename, bytes} = multipart(Buffer.concat(chunks));
      requests.push({url: req.url, filename, bytes});
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({name: filename, subfolder: '', type: 'input'}));
    });
  });
  try {
    process.env.DSH_FFMPEG_PATH = binary;
    saveSettings3(root, {...loadSettings3(root), instances: [{id: 'local', url: srv.url, trusted: true}]});
    ff(['-f', 'lavfi', '-i', 'color=c=red:s=32x24', '-frames:v', '1', path.join(root, 'a.png')]);
    ff(['-f', 'lavfi', '-i', 'color=c=blue:s=32x24:r=5', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'v.mp4')]);
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '1', '-f', 'wav', path.join(root, 'a.wav')]);
    for (const [kind, file, ext] of [['image', 'a.png', 'png'], ['video', 'v.mp4', 'mp4'], ['audio', 'a.wav', 'wav']]) {
      const bytes = fs.readFileSync(path.join(root, file));
      const out = await workflowAdmin(root, {action: 'upload', instanceId: 'local', kind, dataBase64: bytes.toString('base64')});
      assert.equal(out.kind, kind);
      assert.equal(out.sha256, sha(bytes));
      assert.equal(out.bytes, bytes.length);
      assert.match(out.image, new RegExp('\\.' + ext + '$'));
      const seen = srv.requests.at(-1);
      assert.equal(seen.url, '/upload/image');
      assert.match(seen.filename, new RegExp('\\.' + ext + '$'));
      assert.deepEqual(seen.bytes, bytes);
    }
    assert.equal(srv.requests.length, 3);
    // A trusted but non-local instance must never receive an upload from this path.
    saveSettings3(root, {...loadSettings3(root), instances: [
      {id: 'local', url: srv.url, trusted: true},
      {id: 'remote', url: 'https://comfy.example.invalid', trusted: true},
    ]});
    await assert.rejects(workflowAdmin(root, {action: 'upload', instanceId: 'remote', kind: 'image', dataBase64: fs.readFileSync(path.join(root, 'a.png')).toString('base64')}), /不允许发送到远程实例/);
    assert.equal(srv.requests.length, 3);
  } finally {
    await srv.close();
    if (prior === undefined) delete process.env.DSH_FFMPEG_PATH; else process.env.DSH_FFMPEG_PATH = prior;
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('upload rejects kind mismatch, corrupt video and oversize content before contacting the service', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transfer54-'));
  const prior = process.env.DSH_FFMPEG_PATH;
  const srv = await withServer((req, res, requests) => {
    requests.push(req.url);
    res.end(JSON.stringify({name: 'should-not-happen.png'}));
  });
  try {
    process.env.DSH_FFMPEG_PATH = binary;
    saveSettings3(root, {...loadSettings3(root), instances: [{id: 'local', url: srv.url, trusted: true}]});
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '1', '-f', 'wav', path.join(root, 'tone.wav')]);
    const wav = fs.readFileSync(path.join(root, 'tone.wav'));
    await assert.rejects(workflowAdmin(root, {action: 'upload', instanceId: 'local', kind: 'image', dataBase64: wav.toString('base64')}), /仅接受/);
    const fakeMp4 = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypisom'), Buffer.alloc(64, 1)]);
    await assert.rejects(workflowAdmin(root, {action: 'upload', instanceId: 'local', kind: 'video', dataBase64: fakeMp4.toString('base64')}));
    assert.throws(() => classifyMediaBytes54(Buffer.alloc(mediaLimits54.video + 1), 'video'), /64MB/);
    assert.throws(() => classifyMediaBytes54(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]), 'image'), /仅接受/);
    assert.equal(srv.requests.length, 0);
  } finally {
    await srv.close();
    if (prior === undefined) delete process.env.DSH_FFMPEG_PATH; else process.env.DSH_FFMPEG_PATH = prior;
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('studio:// video/audio references bind owner, kind, hash and verified upstream evidence; image legacy stays compatible', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transfer54-'));
  try {
    ff(['-f', 'lavfi', '-i', 'color=c=red:s=32x24:r=5', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'v.mp4')]);
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '1', '-f', 'wav', path.join(root, 'a.wav')]);
    ff(['-f', 'lavfi', '-i', 'color=c=red:s=32x24', '-frames:v', '1', path.join(root, 'i.png')]);
    const jobs = path.join(root, 'workflows3/jobs'); fs.mkdirSync(jobs, {recursive: true});
    const v = fs.readFileSync(path.join(root, 'v.mp4')), a = fs.readFileSync(path.join(root, 'a.wav')), i = fs.readFileSync(path.join(root, 'i.png'));
    fs.writeFileSync(path.join(jobs, 'vid.json'), JSON.stringify({owner: 'o', status: 'completed', kind: 'video', files: [{path: path.join(root, 'v.mp4'), sha256: sha(v), verification: {verified: true, technicalType: 'video'}}]}));
    fs.writeFileSync(path.join(jobs, 'mus.json'), JSON.stringify({owner: 'o', status: 'completed', kind: 'music', files: [{path: path.join(root, 'a.wav'), sha256: sha(a), verification: {verified: true, technicalType: 'audio'}}]}));
    fs.writeFileSync(path.join(jobs, 'img.json'), JSON.stringify({owner: 'o', status: 'completed', kind: 'image', files: [{path: path.join(root, 'i.png'), sha256: sha(i)}]}));
    const video = studioMedia31(root, 'studio://workflow/vid/0', 'o', {kind: 'video'});
    assert.equal(video.kind, 'video'); assert.equal(video.ext, 'mp4'); assert.equal(video.sha256, sha(v));
    assert.equal(studioMedia31(root, 'studio://workflow/mus/0', 'o', {kind: 'audio'}).ext, 'wav');
    assert.throws(() => studioMedia31(root, 'studio://workflow/vid/0', 'o', {kind: 'image'}), /只能引用/);
    assert.throws(() => studioMedia31(root, 'studio://workflow/vid/0', 'other', {kind: 'video'}), /只能引用/);
    assert.equal(studioImage31(root, 'studio://workflow/img/0', 'o').sha256, sha(i));
    fs.writeFileSync(path.join(jobs, 'vid.json'), JSON.stringify({owner: 'o', status: 'completed', kind: 'video', files: [{path: path.join(root, 'v.mp4'), sha256: sha(v)}]}));
    assert.throws(() => studioMedia31(root, 'studio://workflow/vid/0', 'o', {kind: 'video'}), /最终验证/);
    // pipeline stage output of video kind
    fs.mkdirSync(path.join(root, 'pipelines-v3'), {recursive: true});
    const db = new DatabaseSync(path.join(root, 'pipelines-v3/jobs.sqlite'));
    db.exec('CREATE TABLE jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,call_id TEXT,plan TEXT NOT NULL,worker INTEGER)');
    const plan = {id: 'p1', stages: [{id: 'clip', state: 'completed', output: {kind: 'video', file: path.join(root, 'v.mp4'), sha256: sha(v), verification: {verified: true}}}]};
    db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?)').run('p1', 'o', null, JSON.stringify(plan), null); db.close();
    assert.equal(studioMedia31(root, 'studio://pipeline/p1/clip', 'o', {kind: 'video'}).ext, 'mp4');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('bindStudioMedia31 reuses one upload receipt per callId and refuses changed route or kind', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transfer54-'));
  try {
    ff(['-f', 'lavfi', '-i', 'color=c=red:s=16x16:r=5', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'v.mp4')]);
    const jobs = path.join(root, 'workflows3/jobs'); fs.mkdirSync(jobs, {recursive: true});
    const v = fs.readFileSync(path.join(root, 'v.mp4'));
    fs.writeFileSync(path.join(jobs, 'vid.json'), JSON.stringify({owner: 'o', status: 'completed', kind: 'video', files: [{path: path.join(root, 'v.mp4'), sha256: sha(v), verification: {verified: true}}]}));
    const input = {reference: 'studio://workflow/vid/0', sha256: sha(v)};
    let uploads = 0;
    const upload = async (b64, kind) => { uploads++; return {image: 'DSH_x.mp4', sha256: sha(Buffer.from(b64, 'base64')), kind}; };
    assert.equal(await bindStudioMedia31(root, input, 'o', 'call-1', {instanceId: 'one'}, upload, {kind: 'video'}), 'DSH_x.mp4');
    assert.equal(await bindStudioMedia31(root, input, 'o', 'call-1', {instanceId: 'one'}, upload, {kind: 'video'}), 'DSH_x.mp4');
    assert.equal(uploads, 1);
    await assert.rejects(bindStudioMedia31(root, input, 'o', 'call-1', {instanceId: 'two'}, upload, {kind: 'video'}), /路线变化/);
    await assert.rejects(bindStudioMedia31(root, input, 'o', 'call-2', {}, async () => ({image: 'x.mp4', sha256: 'bad', kind: 'video'}), {kind: 'video'}), /回执不匹配/);
    const audioTemplate = {graph: {a: {class_type: 'LoadAudio', inputs: {audio: 'x.wav'}}}, mappings: {source: {node: 'a', input: 'audio'}}};
    assert.equal(mediaBinding54(audioTemplate, 'audio').alias, 'source');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('workflow input ports and pipeline mapping declarations accept video/audio material and reject mismatches', () => {
  const video = {graph: {v: {class_type: 'LoadVideo', inputs: {file: 'a.mp4'}}, s: {class_type: 'SaveVideo', inputs: {}}}, mappings: {source: {node: 'v', input: 'file'}}};
  const audio = {graph: {a: {class_type: 'LoadAudio', inputs: {audio: 'a.wav'}}, s: {class_type: 'SaveAudio', inputs: {}}}, mappings: {source: {node: 'a', input: 'audio'}}};
  assert.equal(validateWorkflowInput54(video, 'source', 'video').port.kind, 'video');
  assert.equal(validateWorkflowInput54(audio, 'source', 'audio').port.kind, 'audio');
  assert.throws(() => validateWorkflowInput54(video, 'source', 'image'), /不匹配/);
  assert.throws(() => validateWorkflowInput54(video, 'missing', 'video'), /不是已声明/);
  const spec = [
    {id: 'clip', executor: 'cloud-media', params: {kind: 'video', connectionId: 'c1', prompt: 'x'}},
    {id: 'upscale', executor: 'comfy-workflow', dependencies: ['clip'], params: {kind: 'video', templateId: 't1', instanceId: 'local', values: {}, inputMappings: {source: 'clip'}}},
  ];
  assert.equal(validatePipeline(spec).length, 2);
  assert.throws(() => validatePipeline([{id: 'txt', executor: 'comfy-image', params: {prompt: 'x', model: 'm'}}, {id: 'bad', executor: 'comfy-workflow', dependencies: ['txt'], params: {kind: 'video', templateId: 't', instanceId: 'local', inputMappings: {source: 'nope'}}}]), /素材依赖/);
});

test('multiple aliases of one workflow stage get independent upload receipts under the same callId', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transfer54-'));
  try {
    ff(['-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', path.join(root, 'i.png')]);
    ff(['-f', 'lavfi', '-i', 'color=c=blue:s=16x16:r=5', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(root, 'v.mp4')]);
    const jobs = path.join(root, 'workflows3/jobs'); fs.mkdirSync(jobs, {recursive: true});
    const i = fs.readFileSync(path.join(root, 'i.png')), v = fs.readFileSync(path.join(root, 'v.mp4'));
    fs.writeFileSync(path.join(jobs, 'img.json'), JSON.stringify({owner: 'o', status: 'completed', kind: 'image', files: [{path: path.join(root, 'i.png'), sha256: sha(i), verification: {verified: true}}]}));
    fs.writeFileSync(path.join(jobs, 'vid.json'), JSON.stringify({owner: 'o', status: 'completed', kind: 'video', files: [{path: path.join(root, 'v.mp4'), sha256: sha(v), verification: {verified: true}}]}));
    const uploads = [];
    const upload = async (b64, kind) => { uploads.push(kind); return {image: 'DSH_' + kind + '.' + (kind === 'image' ? 'png' : 'mp4'), sha256: sha(Buffer.from(b64, 'base64')), kind}; };
    const call = 'p1:stage1:inputs';
    assert.equal(await bindStudioMedia31(root, {reference: 'studio://workflow/img/0', sha256: sha(i)}, 'o', call, {alias: 'image', instanceId: 'one'}, upload, {kind: 'image'}), 'DSH_image.png');
    assert.equal(await bindStudioMedia31(root, {reference: 'studio://workflow/vid/0', sha256: sha(v)}, 'o', call, {alias: 'video', instanceId: 'one'}, upload, {kind: 'video'}), 'DSH_video.mp4');
    assert.deepEqual(uploads, ['image', 'video']);
    // Same alias retried is idempotent and does not upload again.
    assert.equal(await bindStudioMedia31(root, {reference: 'studio://workflow/img/0', sha256: sha(i)}, 'o', call, {alias: 'image', instanceId: 'one'}, upload, {kind: 'image'}), 'DSH_image.png');
    assert.deepEqual(uploads, ['image', 'video']);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
