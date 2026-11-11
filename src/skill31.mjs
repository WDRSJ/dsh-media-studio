import fs from 'node:fs';

export function creativeSkill31(ctx) {
  if (!ctx?.skills) return {name: 'media-studio-creative', registered: false, error: '宿主未提供 skills 注册表'};
  const raw = fs.readFileSync(new URL('../assets/media-studio-creative/SKILL.md', import.meta.url), 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const description = (match?.[1] || '').match(/^description:\s*(.+)$/m)?.[1]?.trim() || 'Media Studio 创作调度技能';
  const body = match ? raw.slice(match[0].length) : raw;
  if (!body.trim()) throw Error('内置创作 Skill 正文为空');
  const dispose = ctx.skills.register({
    name: 'media-studio-creative',
    description,
    content: body,
    source: 'bundled',
    provider: 'media-studio',
    invocation: {modelInvocable: true, userInvocable: true}
  });
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose);
  return {name: 'media-studio-creative', registered: true, builtIn: true, bytes: Buffer.byteLength(body)};
}
