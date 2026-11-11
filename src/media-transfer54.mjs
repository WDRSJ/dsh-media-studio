import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {verifyMedia53} from './media-verify53.mjs';
import {inputPort53} from './media-inputs53.mjs';

// B03 media transfer: strict upload/staging rules shared by the ComfyUI upload
// route and the studio:// reference reader. Content is classified by magic and,
// for video/audio, proven by an existing FFmpeg decode before it can be used.
export const mediaKinds54 = Object.freeze(['image', 'video', 'audio']);
export const mediaLimits54 = Object.freeze({image: 20 * 1024 * 1024, video: 64 * 1024 * 1024, audio: 32 * 1024 * 1024});
export const maxUploadBase64_54 = 92_000_000;
const png = b => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const jpeg = b => b[0] === 255 && b[1] === 216 && b[2] === 255;
const webp = b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
const wav = b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE';
const flac = b => b.toString('ascii', 0, 4) === 'fLaC';
const ogg = b => b.toString('ascii', 0, 4) === 'OggS';
const mp3 = b => b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 255 && (b[1] & 0xe0) === 0xe0);
const ftyp = b => b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp';
const mp4Brand = b => ftyp(b) && !['qt  ', 'M4A ', 'M4B ', 'M4P '].includes(b.toString('ascii', 8, 12));

export function mediaKindLabel54(kind) {
  return kind === 'image' ? '图片' : kind === 'video' ? '视频' : kind === 'audio' ? '音频' : String(kind);
}

// Classifies content from its bytes only. `declaredKind` must match exactly so
// a WAV cannot be uploaded as an image nor an MP4 as an audio file.
export function classifyMediaBytes54(bytes, declaredKind) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw Error('素材为空');
  if (!mediaKinds54.includes(declaredKind)) throw Error('未知媒体类别 ' + String(declaredKind));
  if (bytes.length > mediaLimits54[declaredKind]) throw Error(mediaKindLabel54(declaredKind) + '素材超过 ' + (mediaLimits54[declaredKind] / 1024 / 1024) + 'MB 限制');
  if (declaredKind === 'image') {
    if (bytes.length >= 16 && png(bytes)) return {kind: 'image', ext: 'png'};
    if (bytes.length >= 16 && jpeg(bytes)) return {kind: 'image', ext: 'jpg'};
    if (bytes.length >= 16 && webp(bytes)) return {kind: 'image', ext: 'webp'};
    throw Error('仅接受 PNG、JPEG、WebP 图片');
  }
  if (declaredKind === 'video') {
    if (bytes.length >= 16 && mp4Brand(bytes)) return {kind: 'video', ext: 'mp4'};
    if (bytes.length >= 16 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return {kind: 'video', ext: 'webm'};
    throw Error('仅接受 MP4、WebM 视频');
  }
  if (bytes.length >= 16 && wav(bytes)) return {kind: 'audio', ext: 'wav'};
  if (bytes.length >= 16 && mp3(bytes)) return {kind: 'audio', ext: 'mp3'};
  if (bytes.length >= 16 && flac(bytes)) return {kind: 'audio', ext: 'flac'};
  if (bytes.length >= 16 && ogg(bytes)) return {kind: 'audio', ext: 'ogg'};
  if (bytes.length >= 16 && ftyp(bytes)) return {kind: 'audio', ext: 'm4a'};
  throw Error('仅接受 WAV、MP3、FLAC、OGG、M4A 音频');
}

export function verifier54(root, binary = process.env.DSH_FFMPEG_PATH) {
  return binary || path.join(root, 'tools', 'ffmpeg.exe');
}

// Video/audio are compound formats: a magic prefix is not proof. Require an
// existing FFmpeg full decode; never download one. Images keep the established
// magic check (ComfyUI LoadImage validates further before execution).
export async function assertDecodableMedia54(root, bytes, kind, ext, {binary = process.env.DSH_FFMPEG_PATH, verify = verifyMedia53} = {}) {
  if (kind === 'image') return {verifiedBy: 'magic'};
  const bell = verifier54(root, binary);
  if (!bell || !fs.existsSync(bell)) throw Error('视频/音频素材需要现有 FFmpeg 解码验证；不会自动下载');
  const dir = path.join(root, 'upload-verify54');
  fs.mkdirSync(dir, {recursive: true});
  const temp = path.join(dir, randomUUID() + '.' + ext);
  try {
    fs.writeFileSync(temp, bytes, {flag: 'wx'});
    const verification = await verify(root, temp, kind, {binary: bell});
    return {verifiedBy: 'existing FFmpeg full decode', verification};
  } finally {
    fs.rmSync(temp, {force: true});
  }
}

export async function validateUploadMedia54(root, bytes, declaredKind) {
  const classified = classifyMediaBytes54(bytes, declaredKind);
  const decode = await assertDecodableMedia54(root, bytes, classified.kind, classified.ext);
  return {...classified, bytes: bytes.length, decode};
}

// Used by the pipeline bridge: the alias must target a declared media loader
// port, and the upstream artifact kind must match that port exactly.
export function validateWorkflowInput54(template, alias, inputKind) {
  const mapping = template?.mappings?.[alias];
  const port = inputPort53(template?.graph?.[mapping?.node]?.class_type);
  if (!mapping || !port || mapping.input !== port.input) throw Error('联合素材映射不是已声明的媒体输入端口');
  if (!mediaKinds54.includes(inputKind)) throw Error('上游产物媒体类别无效 ' + String(inputKind));
  if (inputKind !== port.kind) throw Error('上游产物类型 ' + inputKind + ' 与工作流输入端口 ' + port.kind + ' 不匹配');
  return {node: mapping.node, port, inputKind};
}
