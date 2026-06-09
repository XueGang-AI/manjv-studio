# 开发指南

## 环境搭建

```bash
# 1. 依赖
brew install postgresql@16 redis ffmpeg

# 2. 启动服务
brew services start postgresql@16
brew services start redis

# 3. 创建数据库
createdb manjv_studio

# 4. 安装项目依赖
npm install --cache ~/.npm-cache-new

# 5. 配置环境
cp .env.example .env

# 6. 推送数据库
DATABASE_URL="postgresql://xuegang@localhost:5432/manjv_studio?schema=public" npm run db:push

# 7. 种子数据
DATABASE_URL="postgresql://xuegang@localhost:5432/manjv_studio?schema=public" npm run db:seed

# 8. 启动开发
DATABASE_URL="postgresql://xuegang@localhost:5432/manjv_studio?schema=public" npm run dev
```

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API 路由
│   ├── projects/           # 项目页面
│   ├── prompts/            # Prompt 模板管理
│   └── settings/           # 模型设置
├── components/
│   ├── layout/             # Sidebar, TopBar
│   ├── project/            # 业务组件
│   └── ui/                 # Button, Card, Input
├── lib/                    # 工具库
├── server/
│   ├── model-adapters/     # 统一适配层 (Text/Image/Video)
│   ├── queues/             # BullMQ 任务队列
│   ├── services/           # Prompt/FFmpeg/Version/QC
│   └── workflows/          # 工作流定义
└── stores/                 # Zustand 状态

prisma/                     # Schema + Seed + Config
prompts/                    # Prompt 模板库 (25 .prompt + 23 .json)
scripts/                    # 测试和工具脚本
uploads/                    # 文件上传和视频输出
docs/                       # 文档
```

## 代码规范

- 模型调用必须通过 `adapterFactory`，禁止直接调用 Agnes API
- Prompt 必须从 `prompt_templates` 表读取，禁止硬编码
- 生成任务必须写入 `generation_tasks` 表
- API 返回统一格式 `{success, data/error}`
- 组件和页面分离，组件可复用

## 测试

```bash
# 单元测试
npm test

# E2E 全流程测试（需先启动 dev server）
npm run test:e2e
```
