#!/usr/bin/env bash
# 重新生成「网吧便携包」并打成 zip。
# 用法：bash build-portable.sh
# 依赖：node（生成示例作品与语法检查）、git（归档打包）。不需要 zip / npm / 网络。
set -eo pipefail
cd "$(dirname "$0")"

OUT_DIR="circuit-lab-portable"
ZIP="../circuit-lab-portable.zip"

echo "[1/5] 同步单文件 HTML 两份副本"
mkdir -p "$OUT_DIR"
cp index.html "$OUT_DIR/index.html"
cp index.html "$OUT_DIR/电工电路仿真平台.html"

echo "[2/5] 语法检查 + 回归测试"
node -e "
const fs=require('fs');
const s=fs.readFileSync('index.html','utf8');
const m=s.match(/<script>([\s\S]*)<\/script>/);
if(!m)throw new Error('index.html 中没有 <script> 块');
fs.writeFileSync('.tmp_portable_check.js',m[1]);
"
node --check .tmp_portable_check.js
rm -f .tmp_portable_check.js
node test.js | tail -3
if grep -qE 'https?://|@import|fetch\(|XMLHttpRequest' index.html; then
  echo "✗ 检测到外部资源引用，便携版必须零依赖" >&2
  exit 1
fi
echo "  ✓ 页面脚本语法 OK / 零外部依赖"

echo "[3/5] 生成示例作品.json（考场配电板真实快照）"
node -e "
const fs=require('fs');
const {createHarness}=require('./tests/harness');
const H=createHarness();
H.loadProject('p4'); H.runSim();
fs.writeFileSync('$OUT_DIR/示例作品.json', H.circuitJSON(), 'utf8');
console.log('  示例作品: '+H.state.comps.length+' 元件 / '+H.state.wires.length+' 导线');
"

echo "[4/5] 校验两份 HTML 完全一致"
a=$(md5sum index.html | cut -d' ' -f1)
b=$(md5sum "$OUT_DIR/index.html" | cut -d' ' -f1)
c=$(md5sum "$OUT_DIR/电工电路仿真平台.html" | cut -d' ' -f1)
[ "$a" = "$b" ] && [ "$a" = "$c" ] || { echo "✗ HTML 副本不一致" >&2; exit 1; }
echo "  ✓ md5=$a"

echo "[5/5] 打包 zip（含顶层目录 circuit-lab-portable/）"
git add -A -- "$OUT_DIR" >/dev/null
TREE=$(git write-tree)
git archive --format=zip --prefix="$OUT_DIR/" --output="$ZIP" "$TREE:$OUT_DIR"
ls -lh "$ZIP"
echo "完成：可直接解压使用，或只上传单个 HTML 文件。"
