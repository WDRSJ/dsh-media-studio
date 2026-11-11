import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {workflowAdmin, workflowTool} from '../src/workflows3.mjs';
import {saveSettings3, loadSettings3} from '../src/policy3.mjs';
import {contractHash53} from '../src/media-contract51.mjs';

const binary = process.env.DSH_FFMPEG_PATH || 'ffmpeg';
const run = promisify(execFile);
const sha = b => createHash('sha256').update(b).digest('hex');

test('two separate processes polling the same receipt never duplicate download or archive', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crosspoll54-'));
  const prior = process.env.DSH_FFMPEG_PATH;
  execFileSync(binary, ['-nostdin', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', path.join(root, 'out.png')]);
  const png = fs.readFileSync(path.join(root, 'out.png'));
  let historyCalls = 0, viewCalls = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/object_info') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({
      EmptyImage: {output: ['IMAGE'], input: {required: {width: ['INT', {}]}}},
      SaveImage: {output: [], output_node: true, input: {required: {images: ['IMAGE', {}], filename_prefix: ['STRING', {}]}}},
    })); return; }
    if (url.pathname === '/prompt') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({prompt_id: 'cross-1'})); return; }
    if (url.pathname.startsWith('/history/')) { historyCalls++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({['cross-1']: {status: {status_str: 'success'}, outputs: {s: {images: [{filename: 'out.png', subfolder: '', type: 'output'}]}}}})); return; }
    if (url.pathname === '/view') { viewCalls++; res.setHeader('content-type', 'image/png'); res.end(png); return; }
    res.statusCode = 404; res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    process.env.DSH_FFMPEG_PATH = binary;
    saveSettings3(root, {...loadSettings3(root), instances: [{id: 'local', url: 'http://127.0.0.1:' + port, trusted: true}]});
    const graph = {a: {class_type: 'EmptyImage', inputs: {width: 16}}, s: {class_type: 'SaveImage', inputs: {images: ['a', 0], filename_prefix: 'cross'}}};
    const preview = await workflowAdmin(root, {action: 'import', document: graph});
    const imported = await workflowAdmin(root, {action: 'confirmImport', previewId: preview.previewId});
    await workflowAdmin(root, {action: 'enable', templateId: imported.workflow.id, enabled: true});
    const job = await workflowTool(root, {action: 'submit', templateId: imported.workflow.id}, 'owner');
    const script = path.join(root, 'poll-child.mjs');
    const moduleUrl = JSON.stringify(pathToFileURL(path.resolve('src/workflows3.mjs')).href);
    fs.writeFileSync(script, [
      "const mod = await import(" + moduleUrl + ");",
      "const [root, id, owner] = process.argv.slice(2);",
      "try { const result = await mod.workflowTool(root, {action: 'poll', id}, owner); console.log(JSON.stringify(result)); }",
      "catch (e) { console.error(e.message); process.exit(1); }",
    ].join('\n'));
    const env = {...process.env, DSH_FFMPEG_PATH: binary};
    const children = await Promise.all([1, 2].map(() => run(process.execPath, [script, root, job.id, 'owner'], {env, timeout: 120000})));
    for (const child of children) {
      const value = JSON.parse(child.stdout.trim());
      assert.equal(value.status, 'completed');
      assert.equal(value.files.length, 1);
    }
    const receipt = JSON.parse(fs.readFileSync(path.join(root, 'workflows3/jobs', job.id + '.json')));
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.files.length, 1);
    assert.equal(receipt.files[0].sha256, sha(png));
    assert.equal(receipt.files[0].verification.verified, true);
    assert.ok(historyCalls >= 1);
    assert.equal(viewCalls, 1);
    assert.deepEqual(fs.readdirSync(path.dirname(receipt.files[0].path)).filter(f => f.endsWith('.unverified')), []);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (prior === undefined) delete process.env.DSH_FFMPEG_PATH; else process.env.DSH_FFMPEG_PATH = prior;
    fs.rmSync(root, {recursive: true, force: true});
  }
});
