# E2E Mock 全流程测试指南

## 运行方式

```bash
# 1. 启动服务
DATABASE_URL="postgresql://xuegang@localhost:5432/manjv_studio?schema=public" npm run dev

# 2. 在另一个终端运行 E2E 测试
npm run test:e2e
```

## 自动化流程 (20 步)

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

## 成功输出示例

```
✅ E2E 全部 20 步通过！
project_id:      3847bb30-...
episode_id:      2039bb68-...
final_video_id:  9c973e36-...
final_video_url: uploads/final_videos/xxx_ep1_xxx.mp4
duration:        90.0s
resolution:      1080x1920
fps:             25/1
codec:           h264
```

## 前置条件

- PostgreSQL 运行中
- Redis 运行中（E2E 不直接使用但服务需要）
- `USE_MOCK_MODEL=true` 已设置
- `npm run dev` 已启动在 :3000

## 失败排查

| 错误 | 可能原因 | 解决方案 |
|------|----------|----------|
| 服务未启动 | npm run dev 未运行 | 启动 dev server |
| 数据库连接失败 | PostgreSQL 未运行 | `brew services start postgresql@16` |
| 文件不存在 | FFmpeg 未安装 | `brew install ffmpeg` |
| 视频生成失败 | USE_MOCK_MODEL 未设置 | 检查 .env |
