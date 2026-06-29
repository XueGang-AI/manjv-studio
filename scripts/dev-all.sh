#!/usr/bin/env bash
# ============================================
# dev:all 启动脚本 — Web + Worker 双进程
# ============================================
#
# 用法：npm run dev:all
#
# 特性：
# - 同时启动 Next.js (Web) 和 Worker 进程
# - Ctrl+C 同时终止两个进程
# - 任一子进程异常退出时终止另一个

WEB_PORT="${PORT:-3100}"

# 清理函数
cleanup() {
  echo ""
  echo "[dev:all] 正在停止所有进程..."
  [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null
  # 等待子进程退出（最多 5 秒）
  local waited=0
  while [ $waited -lt 5 ]; do
    ! kill -0 "$WORKER_PID" 2>/dev/null && ! kill -0 "$WEB_PID" 2>/dev/null && break
    sleep 1
    waited=$((waited + 1))
  done
  # 强制终止仍在运行的进程
  kill -9 "$WORKER_PID" 2>/dev/null
  kill -9 "$WEB_PID" 2>/dev/null
  echo "[dev:all] 所有进程已停止"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 启动 Worker
npm run worker &
WORKER_PID=$!
echo "[dev:all] Worker PID: $WORKER_PID"

# 启动 Web
npx next dev -p "$WEB_PORT" &
WEB_PID=$!
echo "[dev:all] Web PID: $WEB_PID (port=$WEB_PORT)"

# 等待子进程
while true; do
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "[dev:all] Worker 已退出"
    break
  fi
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "[dev:all] Web 已退出"
    break
  fi
  sleep 1
done

echo "[dev:all] 检测到进程退出，清理所有进程..."
