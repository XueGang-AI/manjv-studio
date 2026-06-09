# 🎬 AI 漫剧可视化生产工作台 (manjv-studio)

AI 驱动的漫剧创作平台，支持故事分析、角色设计、分镜生成、视频合成。

## 技术栈

- **前端**: Next.js 16 + TypeScript + TailwindCSS
- **数据库**: PostgreSQL + Prisma 7
- **任务队列**: BullMQ + Redis
- **视频合成**: FFmpeg
- **模型**: Agnes-2.0-Flash / Agnes-Image-2.0-Flash / Agnes-Video-2.0

## 快速开始

### 环境要求

- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### 安装

```bash
# 1. 安装依赖
npm install --cache ~/.npm-cache-new

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填写实际配置

# 3. 创建数据库
createdb manjv_studio

# 4. 生成 Prisma Client
npm run db:generate

# 5. 推送数据库 schema
npm run db:push

# 6. 填充种子数据
npm run db:seed
```

### 开发

```bash
npm run dev
```

访问 http://localhost:3000

### 测试

```bash
# 健康检查
curl http://localhost:3000/api/health

# 查看项目列表
curl http://localhost:3000/api/projects
```

## 项目结构

```
manjv-studio/
├── src/
│   ├── app/                    # Next.js App Router 页面和 API
│   │   ├── api/                # API 路由
│   │   ├── projects/           # 项目页面
│   │   ├── prompts/            # Prompt 模板管理页
│   │   └── settings/           # 设置页
│   ├── components/             # React 组件
│   │   ├── layout/             # 布局组件 (Sidebar, TopBar)
│   │   ├── project/            # 项目组件 (StepNavigator)
│   │   └── ui/                 # UI 基础组件
│   ├── lib/                    # 工具库
│   ├── server/                 # 服务端代码
│   │   ├── model-adapters/     # 模型适配层
│   │   ├── queues/             # 任务队列
│   │   ├── services/           # 服务
│   │   ├── storage/            # 存储服务
│   │   ├── validators/         # 校验器
│   │   └── workflows/          # 工作流引擎
│   └── hooks/                  # React Hooks
├── prisma/                     # Prisma Schema + Seed
├── prompts/                    # Prompt 模板库
├── scripts/                    # 工具脚本
├── uploads/                    # 文件上传目录
└── docs/                       # 文档
```

## 数据库

核心数据模型（19 张表）：users, projects, story_packages, characters, character_images, episodes, shots, image_prompts, shot_images, video_prompts, shot_videos, voice_scripts, final_videos, generation_tasks, task_logs, prompt_templates, prompt_template_versions, model_configs, project_versions, qc_reports, asset_files

## 开发阶段

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | 项目初始化 | ✅ 完成 |
| 2 | 文件解析 & Prompt 模板库 | ⏳ 待开始 |
| 3+ | 后续阶段 | ⏳ 待开始 |

## npm 缓存注意

本地 npm 缓存有权限问题，请使用 `--cache ~/.npm-cache-new` 标志。
