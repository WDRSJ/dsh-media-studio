import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyMedia53} from './media-verify53.mjs';

const run = promisify(execFile);
const VOICES = {
  'zh-CN': {id: 'zh_CN-huayan-medium', language: 'zh-CN', label: 'Huayan 中文（Piper 神经 TTS）', file: 'zh_CN-huayan-medium.onnx'},
  'en-US': {id: 'en_US-lessac-medium', language: 'en-US', label: 'Lessac English（Piper 神经 TTS）', file: 'en_US-lessac-medium.onnx'},
};

function piperBin(env = process.env) {
  return env.DSH_PIPER_BIN || '';
}
function modelDir(env = process.env) {
  return env.DSH_PIPER_MODEL_DIR || '';
}

export function neuralTtsCapabilities(env = process.env) {
  const bin = piperBin(env), dir = modelDir(env);
  const voices = Object.values(VOICES).filter(v => dir && fs.existsSync(path.join(dir, v.file)));
  return {
    configured: !!(bin && fs.existsSync(bin) && voices.length),
    bin: bin || null,
    modelDir: dir || null,
    voices: voices.map(v => ({id: v.id, language: v.language, label: v.label})),
    note: 'Piper 是本地神经网络 VITS TTS；需单独安装 piper-tts 与 voice 模型，不随插件打包，不调用云端。',
  };
}

export async function synthesizeNeuralTTS(root, {text, voice = '', language = 'zh-CN', rate = 0} = {}) {
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content || content.length > 2000) throw Error('神经 TTS 文本需为 1–2000 字符');
  if (!Number.isFinite(rate) || rate < -2 || rate > 2) throw Error('神经 TTS 语速需为 -2–2');
  const env = process.env;
  const capabilities = neuralTtsCapabilities(env);
  if (!capabilities.configured) throw Error('未配置本地神经 TTS（Piper）：需要 DSH_PIPER_BIN 与 DSH_PIPER_MODEL_DIR，或安装到插件 dataRoot/tools/neural-tts');
  let selected;
  if (voice) {
    selected = Object.values(VOICES).find(v => v.id === voice || v.label === voice);
    if (!selected) throw Error('未安装指定神经 TTS 声音：' + voice);
  } else {
    selected = Object.values(VOICES).find(v => v.language === language) || Object.values(VOICES).find(v => language && v.language.startsWith(language.split('-')[0]));
    if (!selected) throw Error('该语言没有已安装的神经 TTS 声音：' + language);
  }
  const model = path.join(capabilities.modelDir, selected.file);
  if (!fs.existsSync(model)) throw Error('缺少神经 TTS 模型：' + model);
  const dir = path.join(root, 'tts-jobs');
  fs.mkdirSync(dir, {recursive: true});
  const input = path.join(dir, randomUUID() + '.txt');
  const target = path.join(dir, randomUUID() + '.wav');
  fs.writeFileSync(input, content, 'utf8');
  try {
    const timeout = Math.min(600000, 60000 + content.length * 150);
    await run(capabilities.bin, ['--model', model, '--input-file', input, '--output-file', target, '--length-scale', String(1 / Math.max(0.25, 1 + rate * 0.25))], {timeout, windowsHide: true});
    if (!fs.existsSync(target)) throw Error('Piper 没有生成音频文件');
    const bytes = fs.statSync(target).size;
    if (bytes < 44) throw Error('Piper 输出为空或损坏');
    const verification = await verifyMedia53(root, target, 'audio');
    if (!verification.verified) throw Error('Piper 音频未通过解码验证：' + (verification.reason || verification.state || 'unknown'));
    const sha256 = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    return {
      file: target, bytes, sha256, voice: selected.id, language: selected.language, rate,
      verification,
      purposeEvidence: {purpose: 'speech', source: 'piper-tts', engine: 'Piper VITS (neural)', voice: selected.id, language: selected.language, note: '本地神经网络 TTS，不是 Windows 系统 SAPI；质量/音色取决于已安装 voice 模型'},
    };
  } catch (e) {
    try { fs.rmSync(target, {force: true}); } catch {}
    throw Error('本地神经 TTS 失败：' + (e.stderr?.toString().trim() || e.message));
  } finally {
    try { fs.rmSync(input, {force: true}); } catch {}
  }
}
