import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyMedia53} from './media-verify53.mjs';

const run = promisify(execFile);
const POWERSHELL = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const script = `Add-Type -AssemblyName System.Speech
$text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:DSH_TTS_TEXT_B64))
$s=New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if($env:DSH_TTS_VOICE){$s.SelectVoice($env:DSH_TTS_VOICE)}
  $s.Rate=[int]$env:DSH_TTS_RATE
  $s.SetOutputToWaveFile($env:DSH_TTS_FILE)
  $s.Speak($text)
} finally { $s.Dispose() }`;

export async function listWindowsVoices() {
  if (process.platform !== 'win32') throw Error('Windows 本地 TTS 仅在 Windows 可用');
  const command = `Add-Type -AssemblyName System.Speech
$s=New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { "$($_.VoiceInfo.Name)|$($_.VoiceInfo.Culture)|$($_.VoiceInfo.Gender)|$($_.VoiceInfo.Age)" } } finally { $s.Dispose() }`;
  const {stdout} = await run(POWERSHELL(), ['-NoProfile', '-NonInteractive', '-Command', command], {timeout: 30000, windowsHide: true});
  return stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [name, culture, gender, age] = line.split('|');
    return {name, culture, language: String(culture || '').split(/[-_]/)[0], gender, age};
  }).filter(v => v.name);
}

function pickVoice(voices, requested, language, text) {
  if (requested) {
    const found = voices.find(v => v.name.toLocaleLowerCase() === String(requested).toLocaleLowerCase());
    if (!found) throw Error('本机未安装指定语音：' + requested);
    return found;
  }
  if (language) {
    const match = voices.find(v => v.culture.toLowerCase() === language.toLowerCase()) || voices.find(v => v.culture.toLowerCase().startsWith(language.toLowerCase() + '-'));
    if (!match) throw Error('本机未安装该语言语音：' + language + '；已安装：' + voices.map(v => v.culture).join(', '));
    return match;
  }
  const cjk = /[\u3400-\u9fff]/.test(text);
  return voices.find(v => cjk ? v.culture.startsWith('zh') : v.culture.startsWith('en')) || voices[0];
}

export async function synthesizeWindowsTTS(root, {text, voice = '', language = '', rate = 0} = {}) {
  if (process.platform !== 'win32') throw Error('Windows 本地 TTS 仅在 Windows 可用');
  const content = typeof text === 'string' ? text.trim() : '';
  if (!content || content.length > 800) throw Error('TTS 文本需为 1–800 字符；多段请拆分为多个阶段');
  if (!Number.isInteger(rate) || rate < -10 || rate > 10) throw Error('TTS 语速需为 -10–10 的整数');
  if (voice && (typeof voice !== 'string' || voice.length > 100)) throw Error('语音名称无效');
  if (language && (typeof language !== 'string' || !/^[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?$/.test(language))) throw Error('语言代码无效');
  const slowdown = rate < 0 ? 1 + (-rate) * 0.12 : 1;
  const estimatedMs = content.length * 250 * slowdown;
  if (estimatedMs > 240000) throw Error('文本与语速预计超过本地 TTS 时长上限，请拆分更短阶段或提高语速');
  const voices = await listWindowsVoices();
  if (!voices.length) throw Error('本机没有可用的 Windows 语音');
  const chosen = pickVoice(voices, voice, language, content);
  const dir = path.join(root, 'tts-jobs');
  fs.mkdirSync(dir, {recursive: true});
  const target = path.join(dir, randomUUID() + '.wav');
  if (fs.existsSync(target)) throw Error('TTS 输出文件已存在');
  const env = {
    ...process.env,
    DSH_TTS_TEXT_B64: Buffer.from(content, 'utf8').toString('base64'),
    DSH_TTS_VOICE: chosen.name,
    DSH_TTS_RATE: String(rate),
    DSH_TTS_FILE: target,
  };
  const timeout = Math.min(300000, Math.max(30000, estimatedMs + 15000));
  try {
    await run(POWERSHELL(), ['-NoProfile', '-NonInteractive', '-Command', script], {timeout, windowsHide: true, env});
  } catch (e) {
    try { fs.rmSync(target, {force: true}); } catch {}
    throw Error('Windows 本地 TTS 失败：' + (e.stderr?.toString().trim() || e.message));
  }
  try {
    if (!fs.existsSync(target)) throw Error('Windows 本地 TTS 未生成音频文件');
    const bytes = fs.statSync(target).size;
    if (bytes < 44) throw Error('Windows 本地 TTS 输出为空或损坏');
    const verification = await verifyMedia53(root, target, 'audio');
    if (!verification.verified) throw Error('Windows 本地 TTS 音频未通过解码验证：' + (verification.reason || verification.state || 'unknown'));
    const sha256 = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  return {
    file: target, bytes, sha256, voice: chosen.name, language: chosen.culture, rate,
    verification,
    purposeEvidence: {purpose: 'speech', source: 'windows-sapi', engine: 'System.Speech', voice: chosen.name, language: chosen.culture, note: 'Windows 系统语音合成，不是神经网络 TTS；不得宣称神经语音质量'},
  };
  } catch (e) {
    try { fs.rmSync(target, {force: true}); } catch {}
    throw e;
  }
}
