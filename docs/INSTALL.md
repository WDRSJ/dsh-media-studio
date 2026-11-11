# 安装与更新

## 环境

已验证基线：

- Windows x64
- DeepSeek Harness `0.2.2-rc.1`
- Node.js `24.14+`（验收使用 Node `24.21`）
- 可选：ComfyUI 本地服务、FFmpeg、Piper（均由用户自行安装）

安装包不包含 ComfyUI、模型权重、云端凭证、Piper 模型或生成媒体。

## 在隔离 profile 安装

建议先建立独立的 DSH profile / DSH_HOME，避免覆盖日常插件：

```powershell
dsh plugin --profile <your-profile> add .\dsh-media-studio-3.1.0-dev.75.tgz
```

安装后重启该 profile。在 DSH 设置或插件列表中确认 `Media Studio` 已启用。若使用 DSH 插件管理器，也可以选择“从本地 TGZ 安装”。

典型 profile 需要包含：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@local/dsh-media-studio"
      ]
    }
  }
}
```

并在 profile 的 `cordis.patch.yml` 中按需指定独立 dataRoot：

```yaml
- id: media-studio
  name: "@local/dsh-media-studio"
  config:
    dataRoot: "D:/dsh-data/media-studio"
```

不指定时使用 DSH_HOME 下的默认媒体目录。请勿把 dataRoot 指向日常 profile 的数据库或凭证目录。

## 校验安装包

```powershell
Get-FileHash .\dsh-media-studio-3.1.0-dev.75.tgz -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

以 Release 附件中的 `SHA256SUMS.txt` 为准。

## 首次启动

- 没有 ComfyUI 也可以打开 Media Studio、查看欢迎页和配置入口。
- Header 快捷入口可在全局设置中关闭/开启。
- 首次使用 ComfyUI 前，先在“ComfyUI 连接”中添加实例并检测。
- 云端账户在对应媒体的“高级设置 → 云端配置”中配置，费用在 DSH 对话中确认。

## 升级与回滚

1. 先导出重要方案/工作流（高级设置提供导出）。
2. 在隔离 profile 中安装新 TGZ，重启验证。
3. 需要回滚时卸载新版本并重新安装上一版 TGZ；数据目录默认保留。
4. 永久删除资源只移除插件本机记录，不删除 ComfyUI 工作流、模型、媒体或历史。

## 卸载

```powershell
dsh plugin --profile <your-profile> remove @local/dsh-media-studio
```

卸载插件不会自动删除用户 media dataRoot；确认不需要后再手动处理该目录。
