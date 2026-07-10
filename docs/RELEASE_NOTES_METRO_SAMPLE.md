# 成品交付说明：午夜地铁失物招领（30s 样片）

**日期：** 2026-07-10  
**项目：** `9c526e80-4fbe-4ec6-9f09-f6b6a3b333a8`  
**剧集：** `819fb98d-4040-4ca8-8db2-ebc3d8178016`  
**状态：** `FINAL_CONFIRMED`

## 交付物

| 项 | 值 |
|----|-----|
| FinalVideo | `6f946020-080a-4651-a546-4bbe3262f79f` |
| MP4 object key | `projects/.../final_videos/.../e416019b1fe61834.mp4` |
| 发布包 | `projects/.../release_packages/.../e538236457ad6634.json` |
| 规格 | 1080×1920 H.264 + AAC 双声道，约 30.3s |
| 响度（抽样） | 约 -17 LUFS |

本地预览（开发服务在 3100 时）：

```
/projects/9c526e80-4fbe-4ec6-9f09-f6b6a3b333a8/episodes/819fb98d-4040-4ca8-8db2-ebc3d8178016/final-preview
/api/media/projects/9c526e80-4fbe-4ec6-9f09-f6b6a3b333a8/final_videos/episodes/819fb98d-4040-4ca8-8db2-ebc3d8178016/e416019b1fe61834.mp4
```

## 验收摘要

- 规则 QC：故事 / 角色 / 分镜 / 图片 / 视频 / 成片 **6/6 通过**，score 100，issues 0。
- 视觉 QC：分镜图、确认视频片段、成片 **无局部黑边阻断 issue**。
- 媒体文件：角色图、场景参考、分镜图/视频、成片、发布包均落盘可读。
- 转场：任务输出含 `transition_plan`（match_cut ×2 + fade_to_black）。
- last_frame：镜 1/2 在开启 `ARK_VIDEO_ENABLE_LAST_FRAME` 时为 `first_last_frame`；镜 3→4 为 fade，不发尾帧。

## 本轮修复项（相对初版样片）

1. 镜 2 上半屏近黑 / 无效构图（分镜图 + 视频）— 已重生并确认。  
2. Seedance `last_frame` 探针 + match_cut 策略落地。  
3. 镜 3 裸足/腿形变 — 已重生。  
4. 镜 4 墙面伪地图 — 问题驱动重生。  
5. QC 任务 `progress` 成功时归 100；历史 QC 任务回填。  
6. 视频确认不再把 `RENDERED` / `FINAL_CONFIRMED` 回退到更早状态。

## 已知残差（不阻断本轮交付）

- 工牌、墙面地图/海报仍可能有不可读伪字纹理（无 OCR 自动 QC）。
- 镜 2→3 窗口到金属柜的空间跳切仍可见（剧情换点 + 模型尾帧不完全贴合）。
- 人物脸型/发型跨镜可能轻微漂移。

## 相关代码与文档

- `src/server/services/seedance-last-frame.ts`
- `src/server/services/media-visual-qc.service.ts`
- `src/server/services/video-transition-plan.ts`
- `docs/ARK_LAST_FRAME_PROBE_REPORT.md`
- `docs/ENV.md`（`ARK_VIDEO_ENABLE_LAST_FRAME`）
- 探针：`npm run probe:ark:video:last-frame`
