# 真实 API 1 分钟一致性验收记录

更新时间：2026-06-28

> 历史记录说明：本文记录当次 60 秒真实 API 验收的实际环境，下面的旧模型名和本地媒体路径是历史产物信息，不代表当前默认配置或当前存储架构。当前默认配置以 `.env.example` 和 `src/server/model-adapters/model-config.ts` 为准；当前正式产物以 `storageObjectKey` / `storageProvider` 为准，读取 URL 由 API 按当前媒体存储动态生成。

## 验收对象

- 项目 ID：`436d4d93-2d94-4f32-888a-e5e9e3d17ed3`
- 剧集 ID：`544d2181-bb0e-4c2a-9d5c-2a3d8a74c1da`
- 目标时长：60 秒
- 视频模型：`doubao-seedance-1-5-pro-251215`
- 图片模型：`doubao-seedream-5-0-260128`

## 关键修复

1. 分镜时长规划改为基于真实视频模型名，而不是仅使用 provider。
2. Seedance 1.5 单镜头上限按 12 秒处理，Seedance 2.0 单镜头上限按 15 秒处理。
3. 分镜归一化现在保证每个镜头为 4 秒到模型上限之间的整数秒，并保证总时长精确等于目标时长。
4. 场景参考图不再依赖图片模型一次返回多图，改为按 `establishing`、`key_angle` 逐张生成，确保缺失类型能补齐。
5. 分镜图页面新增场景参考图展示区，前端可以直接看到每个场景的参考图和绑定镜头。

## 一致性链路验收

### 人物一致性

- 已生成 5 张角色参考图：`front_full_body`、`front_half_body`、`left_side`、`right_side`、`back_view`。
- 6 张分镜图生成时，每张都发送了 2 张角色参考图。
- 分镜图产物参数中 `character_reference_image_count = 2`，`sent_reference_image_count = 4`。

### 场景一致性

- 已生成 2 个场景：
  - `办公室 · 深夜`
  - `玻璃会议室 · 深夜`
- 每个场景已补齐 2 张场景参考图：`establishing`、`key_angle`。
- 6 个镜头全部绑定到对应 Scene。
- 6 张分镜图生成时，每张都发送了 2 张场景参考图。
- 分镜图产物参数中 `scene_reference_image_count = 2`，`sent_reference_image_count = 4`。

### 视频一致性说明

视频阶段使用 Seedance 的 `first_frame` 模式。该模式下不再同时发送额外参考图，而是使用已确认分镜图作为首帧；人物和场景一致性已经在首帧分镜图阶段通过角色参考图和场景参考图固化。

## 60 秒成片验收

- 分镜：6 个镜头，总时长 60 秒，单镜头 5 到 12 秒。
- 视频片段：6 段真实视频全部完成，片段时长与 DB 镜头时长一致。
- 最终 MP4：
  - URL：`/api/local-media/final_videos/436d4d93-2d94-4f32-888a-e5e9e3d17ed3_ep1_1782576732814.mp4`（历史本地路径）
  - ffprobe 实际时长：60.325011 秒
  - 分辨率：1080x1920
  - 视频编码：H.264
  - 音频编码：AAC
  - 文件大小：约 34 MB

## 前端验收

### 分镜图页面

- 页面：`/projects/436d4d93-2d94-4f32-888a-e5e9e3d17ed3/episodes/544d2181-bb0e-4c2a-9d5c-2a3d8a74c1da/shot-images`
- 已看到“场景参考图”模块。
- 显示 2 个场景、4 张图。
- 4 张场景参考图均成功加载。
- 页面同时显示 6 个镜头均已生成并确认。

### 成片预览页面

- 页面：`/projects/436d4d93-2d94-4f32-888a-e5e9e3d17ed3/episodes/544d2181-bb0e-4c2a-9d5c-2a3d8a74c1da/final-preview`
- 页面显示最终视频已生成。
- 浏览器 video 元数据：
  - `readyState = 4`
  - `duration = 60.325011`
  - `videoWidth = 1080`
  - `videoHeight = 1920`
  - `controls = true`

## 验证命令

```bash
npm test
npx tsc --noEmit
npm run lint
# 历史本地文件验收命令。当前媒体存储成片由 QC 服务临时下载 read URL 后 ffprobe。
ffprobe -v error -show_entries format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate -of json uploads/final_videos/436d4d93-2d94-4f32-888a-e5e9e3d17ed3_ep1_1782576732814.mp4
```

结果：

- `npm test`：7 个测试文件，163 个测试全部通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：无错误，仅保留既有 `<img>` 警告。
