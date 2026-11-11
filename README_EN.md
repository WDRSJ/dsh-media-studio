# DSH Media Studio 3.1

A visual creation and media-resource workspace for **DeepSeek Harness (DSH)**.

DSH Media Studio does not bundle a generative model engine. It organizes DSH natural-language creation, local ComfyUI workflows, and cloud media services into a usable workspace for image, video, music, and speech creation.

> Version: `3.1.0-dev.75`  
> Status: **Public Preview / Pre-release**, not Stable.

## Highlights

- Image, video, music, and speech workspaces
- Smart collaboration: natural-language goal, execution strategy, reviewable plan, execution
- Built-in `media-studio-creative` DSH Skill
- ComfyUI workflow scan/import/conversion/binding/run
- Local, Cloud, Hybrid, and Auto execution modes
- Real loader/resource discovery across configured ComfyUI instances
- Task history, pause/resume, archive and recycle bin
- Windows SAPI and optional Piper speech engines

## Install

Download the TGZ from [Releases](https://github.com/WDRSJ/dsh-media-studio/releases), verify `SHA256SUMS.txt`, then install into an isolated DSH profile:

```powershell
dsh plugin --profile <your-profile> add .\dsh-media-studio-3.1.0-dev.75.tgz
```

No ComfyUI, cloud credentials, model weights, Piper models, or generated media are included.

## Documentation

- [Installation](docs/INSTALL.md)
- [ComfyUI](docs/COMFYUI.md)
- [Limitations](docs/LIMITATIONS.md)
- [Development](docs/DEVELOPMENT.md)

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
