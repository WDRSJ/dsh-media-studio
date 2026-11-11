import fs from 'node:fs';
import path from 'node:path';
import {verifyMedia53} from './media-verify53.mjs';

// B03: one final gate for every media outlet. The declared kind decides the
// technical type (music/speech are audio containers); bytes are proven only by
// an actual FFmpeg decode, never by MIME or file extension. If no existing
// FFmpeg is configured the artifact is marked verification-required instead of
// being silently reported as verified; this module never downloads binaries.
export const finalKinds54 = Object.freeze(['image', 'video', 'audio', 'music', 'speech']);
export function technicalType54(kind) {
  return ['music', 'speech'].includes(kind) ? 'audio' : kind;
}
export function verifierPath54(root, binary = process.env.DSH_FFMPEG_PATH) {
  return binary || path.join(root, 'tools', 'ffmpeg.exe');
}
export function verifierAvailable54(root, binary = process.env.DSH_FFMPEG_PATH) {
  const file = verifierPath54(root, binary);
  return {available: !!file && fs.existsSync(file), binary: file};
}

// Returns {state:'passed'|'verification-required'|'validation-failed', ...}.
export async function auditFinalFile54(root, file, kind, {binary = process.env.DSH_FFMPEG_PATH, verify = verifyMedia53} = {}) {
  if (!finalKinds54.includes(kind)) return {state: 'validation-failed', reason: '未知媒体类别 ' + String(kind)};
  const expected = technicalType54(kind);
  if (!file || !fs.existsSync(file)) return {state: 'validation-failed', reason: '成品文件不存在或不可读'};
  const verifier = verifierPath54(root, binary);
  if (!verifier || !fs.existsSync(verifier)) return {state: 'verification-required', expected, reason: '未配置现有FFmpeg，不能证明产物；不会自动下载'};
  try {
    const verification = await verify(root, file, expected, {binary: verifier});
    return {state: 'passed', expected, verification};
  } catch (e) {
    return {state: 'validation-failed', expected, reason: e.message};
  }
}
