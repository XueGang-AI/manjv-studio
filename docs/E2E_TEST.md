# E2E 测试指南

## Mock 全流程测试

Mock E2E 使用本地 Mock 模型，覆盖从创建项目到最终 MP4、QC、发布包的完整链路。

```bash
# 1. 启动 Web + Worker（推荐）
USE_MOCK_MODEL=true npm run dev:all

# 2. 运行 E2E
npm run test:e2e
```

如服务不在 `http://localhost:3000`，可指定：

```bash
E2E_BASE_URL=http://localhost:3001 npm run test:e2e
```

### Mock 自动化流程 (22 步)

1. 创建项目
2. 生成故事方案
3. 确认故事方案
4. 生成角色设定卡
5. 确认全部角色
6. 生成角色候选图
7. 自动选择角色标准图
8. 自动确认角色标准图
9. 生成第 1 集分镜脚本
10. 确认分镜脚本
11. 生成场景参考图
12. 生成分镜图
13. 运行 QC
14. 自动确认分镜图
15. 生成视频片段
16. 运行 QC
17. 自动确认视频片段
18. 合成最终 MP4 视频
19. 运行项目 QC
20. 生成发布包 manifest
21. 验证视频文件存在
22. ffprobe 检测视频参数

### 成功输出示例

```text
E2E 全部 22 步通过！
project_id:      d97512be-0b17-...
episode_id:      b37ea308-f4c6-...
final_video_id:  1a09f58a-f4e4-...
final_video_url: uploads/final_videos/xxx_ep1_xxx.mp4
duration:        90.0s
resolution:      1080x1920
fps:             25/1
codec:           h264
audio:           aac
```

## 真实 API 最小闭环测试

真实闭环要求 `.env` 中配置 Ark 凭证，并关闭 Mock：

```env
USE_MOCK_MODEL=false
ARK_API_KEY=...
```

运行：

```bash
npm run dev:all
npm run test:e2e:real
```

### 真实闭环流程

1. 创建测试项目
2. Ark 文本模型生成故事方案
3. 确认故事方案
4. Ark 文本模型生成角色设定
5. 确认角色
6. Ark 图片模型生成角色图
7. 确认标准角色图
8. Ark 文本模型生成分镜脚本
9. 确认分镜
10. Ark 图片模型生成场景参考图
11. Ark 图片模型生成分镜图
12. 确认分镜图
13. Ark/Seedance 创建视频异步任务（确认分镜图作为 `first_frame`）
14. 轮询远端任务直到 completed
15. 下载真实视频到本地
16. FFmpeg 合成最终 MP4
17. ffprobe 验证

### 真实接口注意事项

- Seedance 图片输入模式互斥：`first_frame` / `last_frame` 不能与 `reference_image` 混用。生产链路用确认分镜图作为 `first_frame`；角色和场景参考图在分镜图生成阶段传入并固化到首帧。
- 若强制指定 `ARK_VIDEO_MODEL=doubao-seedance-2-0-260128`，账号必须先在 Ark 控制台开通该模型；未开通时接口会返回 `ModelNotOpen`。
- 单片段成片也必须走 FFmpeg `concatVideos()` 两阶段规范化链路，确保输出落在 `uploads/final_videos/` 并可被 `/api/local-media/final_videos/...` 读取。

## 探针测试

```bash
npm run probe:ark:text
npm run probe:ark:image
npm run probe:ark:video
npm run probe:ark:video:poll -- --task-id <id> --timeout-minutes 60 --interval-seconds 10
```

探针脚本只用于联调真实 Ark 接口，不进入生产服务链路。

## 前置条件

- PostgreSQL 运行中，且 `DATABASE_URL` 可连接。
- Worker 进程已启动；仅启动 `npm run dev` 时异步任务不会自动执行。
- Redis 推荐启动；不可用时 SSE 会降级为 DB 轮询。
- FFmpeg / ffprobe 已安装。
- `.env` 已配置，生产环境不得启用 `USE_MOCK_MODEL=true`。

## 失败排查

| 错误 | 可能原因 | 处理方式 |
|------|----------|----------|
| 服务未启动 | Web 未运行或 `E2E_BASE_URL` 错误 | 启动 `npm run dev:all` 或修正地址 |
| 任务一直 pending | Worker 未运行 | 启动 `npm run worker` 或 `npm run dev:all` |
| 数据库连接失败 | PostgreSQL 未运行或连接串错误 | 检查 `DATABASE_URL` |
| Redis 连接失败 | Redis 未运行 | 可忽略或启动 Redis，系统会 DB 轮询降级 |
| ffprobe 失败 | FFmpeg 未安装或路径错误 | 安装 FFmpeg，检查 `FFMPEG_PATH` / `FFPROBE_PATH` |
| 视频一直 queued | Ark 视频队列拥堵 | 后续用 `probe:ark:video:poll` 继续轮询 |
| `ModelNotOpen` | 当前 Ark 账号未开通指定视频模型 | 在 Ark 控制台开通模型，或使用 `.env` 中已开通的视频模型 |
| `first/last frame content cannot be mixed with reference media content` | Seedance 首帧模式与参考媒体模式混用 | 视频阶段只发送确认分镜图首帧；角色/场景参考放在分镜图阶段 |
| 分镜图生成报错 | 角色图或场景参考未准备好 | 确认前置阶段完成并已确认 |
