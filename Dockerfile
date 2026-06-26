# ============================================
# AI 漫剧平台 — 开发/演示镜像
# Web (Next.js) 与 Worker 共用同一镜像，通过 APP_ROLE 区分启动逻辑
# ============================================
FROM node:24-alpine

# FFmpeg：worker 的 final-render 视频合成需要
RUN apk add --no-cache ffmpeg

WORKDIR /app

# 先复制依赖描述与 prisma schema，利用 docker 层缓存
# postinstall (prisma generate) 在 npm ci 时执行，需要 schema 在场
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma

# 安装全部依赖（worker 与 seed 需要 tsx 等 devDependencies，不能 --omit=dev）
# postinstall 会执行 prisma generate，而 prisma.config.ts 用 env('DATABASE_URL') 解析配置，
# 此阶段未连库，给占位值让 config 加载通过即可（generate 不实际连接数据库）
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN npm ci

# 复制源码、seed、prompts 等
COPY . .

# Prisma client 生成（postinstall 已触发，保险再跑一次）
RUN npx prisma generate

# Next.js 生产构建（build 阶段不连库，给占位 DATABASE_URL 防止误读崩溃）
RUN DATABASE_URL="postgresql://placeholder@localhost:5432/placeholder?schema=public" npm run build

# entrypoint 赋可执行权限
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

# APP_ROLE=web：启动前自动 db push + 首次 seed
# APP_ROLE=worker：直接启动 worker
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
