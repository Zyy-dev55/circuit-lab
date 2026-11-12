#!/usr/bin/env bash
# 一键把本仓库发布到 GitHub。
# 用法：
#   export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
#   export GITHUB_USER=你的用户名
#   export GITHUB_REPO=circuit-lab
#   bash publish.sh
# 仓库不存在时自动创建（公开），存在时直接推送到 main 分支。
set -euo pipefail

: "${GITHUB_TOKEN:?请先 export GITHUB_TOKEN（GitHub PAT，需 repo 权限）}"
: "${GITHUB_USER:?请先 export GITHUB_USER（GitHub 用户名）}"
: "${GITHUB_REPO:?请先 export GITHUB_REPO（仓库名）}"

cd "$(dirname "$0")"

API="https://api.github.com"
AUTH="Authorization: Bearer ${GITHUB_TOKEN}"
ACCEPT="Accept: application/vnd.github+json"

echo "==> 检查仓库 ${GITHUB_USER}/${GITHUB_REPO} ..."
code=$(curl -sS -o /dev/null -w "%{http_code}" -H "$AUTH" -H "$ACCEPT" \
  "$API/repos/${GITHUB_USER}/${GITHUB_REPO}")

if [ "$code" = "404" ]; then
  echo "==> 仓库不存在，创建公开仓库 ..."
  curl -sS -f -X POST -H "$AUTH" -H "$ACCEPT" "$API/user/repos" \
    -d "{\"name\":\"${GITHUB_REPO}\",\"description\":\"电工电路仿真调试平台（类 eNSP，单文件 HTML）\",\"private\":false}" \
    -o /dev/null
  echo "==> 已创建"
elif [ "$code" = "200" ]; then
  echo "==> 使用已有仓库"
else
  echo "!! 无法访问仓库（HTTP $code）。检查 token 权限或仓库名。"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b main
  git add .
  git -c user.name="WorkBuddy" -c user.email="workbuddy@local.invalid" \
    commit -m "Initial commit: 电工电路仿真调试平台"
fi

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  git add .
  git -c user.name="WorkBuddy" -c user.email="workbuddy@local.invalid" \
    commit -m "Initial commit: 电工电路仿真调试平台"
fi

CLEAN_URL="https://github.com/${GITHUB_USER}/${GITHUB_REPO}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$CLEAN_URL"
else
  git remote add origin "$CLEAN_URL"
fi

echo "==> 推送到 main ..."
git -c http.extraheader="AUTHORIZATION: bearer ${GITHUB_TOKEN}" \
  push -u origin main

# 不把 token 留在 .git/config 里
git remote set-url origin "$CLEAN_URL"
echo "==> 完成：https://github.com/${GITHUB_USER}/${GITHUB_REPO}"
