# 开发与构建

## 依赖

- Node.js 24.14+
- npm
- DSH 0.2.2-rc.1（运行/集成验证）
- 可选：FFmpeg、Piper、ComfyUI

```bash
npm ci
```

## 测试

```bash
npm test
```

完整的媒体契约/回执测试需要外部程序：

- `DSH_FFMPEG_PATH`：已有 `ffmpeg` 可执行文件
- `DSH_PIPER_BIN`、`DSH_PIPER_MODEL_DIR`：已有 Piper 程序与模型

测试不会下载任何二进制或模型。未配置外部程序时，相关测试应被你的环境视为外部依赖缺失，而不是生产插件自动下载。

## 构建

```bash
npm pack
```

生成 `dsh-media-studio-3.1.0-dev.75.tgz`。发布时同时提供 `SHA256SUMS.txt`。

## 目录

- `src/`：DSH 插件后端、工具、资源与执行路由
- `ui/`：DSH Web 客户端界面
- `engine/`：兼容的旧媒体执行引擎
- `assets/`：默认策略与内置 `media-studio-creative` Skill
- `test/`：自动化测试
- `docs/`：公开文档与截图

## 发布检查

1. 工作树干净，版本与标签一致。
2. `npm test` 通过。
3. 全新隔离 DSH profile 安装 TGZ，确认 Skill 注册。
4. 没有 ComfyUI 时仍能加载和配置。
5. 校验 TGZ/SHA256SUMS，并确认 Release 附件一致。
