#!/bin/sh
# ============================================
# 容器入口：按 APP_ROLE 区分启动逻辑
# ============================================
set -e

if [ "$APP_ROLE" = "web" ]; then
  echo "[entrypoint] 同步数据库 schema (prisma db push)..."
  npx prisma db push

  # 基础数据仅首次初始化；Prompt 模板在下方每次启动同步。
  if [ ! -f /app/uploads/.db-seeded ]; then
    echo "[entrypoint] 首次初始化，执行 seed..."
    npx tsx prisma/seed.ts
    mkdir -p /app/uploads
    touch /app/uploads/.db-seeded
    echo "[entrypoint] seed 完成"
  else
    echo "[entrypoint] 数据库已初始化，跳过 seed"
  fi

  echo "[entrypoint] 同步 Prompt 模板..."
  npx tsx scripts/seed_templates.ts

  echo "[entrypoint] 启动 Web: $*"
  exec "$@"
fi

if [ "$APP_ROLE" = "worker" ]; then
  echo "[entrypoint] 启动 Worker: $*"
  exec "$@"
fi

# 未指定角色时直接执行
exec "$@"
