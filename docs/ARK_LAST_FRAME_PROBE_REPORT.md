# Ark Seedance last_frame Probe Report

**Generated:** 2026-07-10T03:17:38.514Z  
**Model:** `doubao-seedance-1-5-pro-251215`  
**Endpoint:** `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`  
**API key configured:** yes  
**Wait mode:** yes  

## 中文结论（P0-1 + P1-2）

- **结论：`SUPPORTED`** — 当前账号 + 默认 Seedance 1.5 Pro 接受并成功完成 `first_frame` + `last_frame` 图生视频。
- **生产策略（P1-2 已落地）：**
  - 默认开关仍关闭（仓库 `.env.example` 注释说明，不自动开启）。
  - 显式 `ARK_VIDEO_ENABLE_LAST_FRAME=true` 后，仅 **`match_cut` + 首帧 + 下一镜已确认分镜图** 附加尾帧。
  - 共享策略：`src/server/services/seedance-last-frame.ts`（批量 `GENERATE_SHOT_VIDEOS` 与单镜视频重生共用）。
- **互斥已验证：** 同时带 `last_frame` 与 `reference_image` 会 400（与现网 Adapter 不混用策略一致）。
- **role 必填：** 两张图不带 `role` 会 400。
- **Adapter 无需改字段：** 生产 payload 形态与远端一致。
- **样片回归（2026-07-10）：** 《午夜地铁失物招领》开启尾帧后，镜 1/2 写入 `seedance_input_mode=first_last_frame`；逐帧质检与成品 QC 后项目状态 `FINAL_CONFIRMED`。

## Images

- first_frame: `https://ark-project.tos-cn-beijing.volces.com/doc_image/seepro_i2v.png`
- last_frame: `https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imageToimage.png`

## Verdict

| Field | Value |
|-------|--------|
| verdict | **SUPPORTED** |
| production_advice | **enable_with_match_cut_only** |

> Production default remains **disabled**. After this probe, P1-2 ships match_cut-only last-frame policy. To enable: set `ARK_VIDEO_ENABLE_LAST_FRAME=true` and restart Web + Worker. Verify `ShotVideo.params.seedance_input_mode === 'first_last_frame'` on match_cut boundaries.

## Cases

| ID | Label | create_ok | http | task_id | wait | error |
|----|-------|-----------|------|---------|------|-------|
| A | first_frame only (baseline) | yes | 200 | `cgt-20260710…` | succeeded / video=yes / 51s | - |
| B | first_frame + last_frame (core) | yes | 200 | `cgt-20260710…` | succeeded / video=yes / 82s | - |
| C | first_frame + last_frame same URL | yes | 200 | `cgt-20260710…` | (not waited) | - |
| D | first + last + reference_image (mutex) | no | 400 | - | (not waited) | http=400 code=InvalidParameter message=The parameter `content` specified in the request is not valid: last frame image content cannot be mixed with reference image or draft_task content. Request id: 021783653458523ffa263910bfaab0198f27d0234753c49f5ea47 |
| E | two image_url without roles | no | 400 | - | (not waited) | http=400 code=InvalidParameter message=The parameter `content` specified in the request is not valid: role must be specified for image contents. Request id: 021783653458682ffa263910bfaab0198f27d0234753c498b828f |

## Notes

- Case B create+wait completed with video_url. Production switch still defaults to OFF; enable only after P1-2 policy decision.
- Case D rejected mixed modes — aligns with production first/last vs reference_image mutual exclusion.
- Case C accepted identical first/last URL.

## Code path alignment

| Production path | Expectation after probe |
|-----------------|-------------------------|
| `ArkVideoAdapter` sends `role: last_frame` only when env flag + `lastImage` | Confirmed by Case B payload shape |
| `reference_image` not mixed with first/last frame | Case D checks mutual exclusion |
| `shot-videos.handler` + video regenerate fill last frame on `match_cut` only | Implemented in P1-2 via `seedance-last-frame` |
| Default env | Keep `ARK_VIDEO_ENABLE_LAST_FRAME` unset/false unless intentionally enabling |

## How to re-run

```bash
npm run probe:ark:video:last-frame
npm run probe:ark:video:last-frame -- --wait
npm run probe:ark:video:last-frame -- --wait --case-f --case-f-model doubao-seedance-2-0
```

## Decision matrix

| Result | Advice |
|--------|--------|
| SUPPORTED (+ optional wait ok) | `enable_with_match_cut_only` after product decision; still explicit env |
| CREATE_REJECTED | `keep_disabled`; consider export-tail-frame alternative in P1-2 |
| CREATE_OK_RUN_FAILED | `keep_disabled`; inspect wait error / content policy / image fetch |
| INCONCLUSIVE | `retry_probe` after fixing key/network/quota |
