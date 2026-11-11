# Third-party notices

DSH Media Studio is licensed under MIT. This repository does not redistribute model weights, ComfyUI, custom nodes, Piper models, generated media, cloud credentials, or user data.

## Runtime npm dependencies

| Package | Version | License | Role |
| --- | --- | --- | --- |
| `zod` | 4.6.7 | MIT | Runtime schema validation |
| `tencentcloud-sdk-nodejs-mps` | 4.1.335 | Apache-2.0 | Optional existing Tencent Cloud media adapter |

`@deepseek-ai/schemastery` is a dev dependency (`3.18.5`, MIT).

## DSH

DeepSeek Harness is a separate host application and is not redistributed here. Its license and terms belong to its authors.

## ComfyUI and custom nodes

ComfyUI and any custom nodes are installed by the user. Their licenses are determined by their respective projects and node authors. Media Studio imports workflow JSON and calls the user's ComfyUI service; it does not bundle those components.

## Models

All model weights (checkpoints, UNETs, text encoders, VAEs, LoRA, ControlNet, TTS models, etc.) are external. They are not covered by this project's MIT license and are not distributed in the TGZ or source archive.

## Piper / SAPI

Piper and its voice models are optional external components; their licenses belong to the Piper project and voice model authors. Windows SAPI is provided by the operating system. Media Studio only invokes configured engines.

## Trademarks

Provider names, model names, ComfyUI, DeepSeek and other marks belong to their respective owners. Their appearance does not imply endorsement or API access.
