# E2E 测试指南

## Mock 全流程测试

一键运行，从创建项目到最终 MP4，全程自动确认：

```bash
# 1. 启动服务（Mock 模式）
DATABASE_URL="postgresql://xuegang@localhost:5432/manjv_studio?schema=public" npm run dev

# 2. 运行 E2E
npm run test:e2e
```

### Mock 自动化流程 (20 步)

1. 创建项目
2. 生成故事方案
3. 自动确认故事方案
4. 生成角色设定卡 (3 个角色)
5. 自动确认全部角色
6. 生成角色候选图 (12 张)
7. 自动选择每个角色的第 1 张图
8. 自动确认全部标准角色图
9. 生成第 1 集分镜脚本 (6 个镜头)
10. 自动确认分镜脚本
11. 生成分镜图 (24 张)
12. 自动选择每个镜头的第 1 张图
13. 自动确认全部分镜图
14. 生成视频片段 (12 段)
15. 自动选择每个镜头的第 1 个视频
16. 自动确认全部视频片段
17. 合成最终 MP4 视频
18. 运行 QC 质量检查
19. 验证视频文件存在
20. ffprobe 检测视频参数

### 成功输出示例

```
✅ E2E 全部 20 步通过！
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

设置 `USE_MOCK_MODEL=false` 后运行：

```bash
# 1. 设置真实模式
# 编辑 .env: USE_MOCK_MODEL=false

# 2. 重启服务
npm run dev

# 3. 运行真实最小闭环
npm run test:e2e:real
```

### 真实闭环流程

1. 创建测试项目
2. **真实 Agnes-2.0-Flash** 生成故事方案
3. 确认故事方案
4. **真实 Agnes-2.0-Flash** 生成角色设定 (3-4 chars)
5. 确认角色
6. **真实 Agnes-Image-2.0-Flash** 生成角色图 (1 per char)
7. 确认全部标准角色图
8. **真实 Agnes-2.0-Flash** 生成分镜脚本 (6-8 shots)
9. 确认分镜
10. **真实 Agnes-Image-2.0-Flash** 生成分镜图
11. 确认分镜图
12. **真实 Agnes-Video-V2.0** 创建视频异步任务
13. 轮询直到 completed（可能需要较长时间）
14. 下载真实视频到本地
15. FFmpeg 合成最终 MP4
16. ffprobe 验证

### 重要说明

- **视频步骤 12-13**: 真实视频生成是异步的，创建任务后可能需要在队列中等待（非高峰期 ~2 分钟，高峰期可能数小时）。任务创建成功后会保存 `remote_task_id`，可稍后继续检查。
- **继续检查**: 在前端 shot-videos 页面点击"继续检查任务"按钮，或使用探针脚本：`npm run probe:agnes:video:poll -- --task-id <task_id>`
- **video_url 字段**: Agnes 视频完成响应中，视频 URL 在 `remixed_from_video_id` 字段。

### 已知限制

- **视频模型**: 异步任务模式，创建后需轮询。队列可能拥堵。非高峰期处理时间约 2 分钟。
- **视频分辨率**: 当前输出 1280×768（非严格竖屏 1080×1920），需用 FFmpeg 缩放。
- **图片模型**: `style`、`size`、`response_format` 参数不被支持，已在 Adapter 中移除或处理。

## 探针测试

```bash
npm run probe:agnes:text          # 文本模型连通性
npm run probe:agnes:image         # 图片模型连通性
npm run probe:agnes:video         # 视频模型连通性（创建+短轮询）
npm run probe:agnes:video:poll    # 轮询指定 task（--task-id <id>）
npm run probe:agnes:video:t2v     # Case A: 纯文生视频
npm run probe:agnes:video:i2v-url # Case B: 图生视频(URL)
npm run probe:agnes:video:i2v-b64 # Case C: 图生视频(base64)
```

poll 脚本参数：

```bash
npm run probe:agnes:video:poll -- --task-id <id> --timeout-minutes 60 --interval-seconds 10
```

## 前置条件

- PostgreSQL 运行中
- Redis 运行中
- FFmpeg 已安装
- `.env` 已配置

## 失败排查

| 错误 | 可能原因 | 解决方案 |
|------|----------|----------|
| 服务未启动 | npm run dev 未运行 | 启动 dev server |
| 数据库连接失败 | PostgreSQL 未运行 | `brew services start postgresql@16` |
| 文件不存在 | FFmpeg 未安装 | `brew install ffmpeg` |
| 视频生成失败 | USE_MOCK_MODEL 未设置 | 检查 .env |
| 图片 API 400 | `style` 参数不支持 | 已修复，Adapter 不再传 style |
| 图片 API 400 | `response_format` 不支持 | 已修复，从 URL 下载转 base64 |
| 视频一直 queued | 队列拥堵 | 等待更长时间，或用 poll 脚本后续检查 |
| 视频 URL 为空 | 字段名不匹配 | 已修复，Adapter 检查 `remixed_from_video_id` |
| 分镜生成报 400 | 角色图未全部确认 | 需确认每个角色的标准图 |
