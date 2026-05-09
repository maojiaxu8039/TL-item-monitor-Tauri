#!/bin/bash
# 编译脚本 - 在 NAS 上执行
set -e

echo "=== 开始编译 ==="
cd /workspace/tl-monitor/server-standalone

# 拉取最新代码
echo "拉取最新代码..."
git fetch origin main
git reset --hard origin/main

# 编译
echo "编译中..."
export PATH=/root/.cargo/bin:$PATH
cargo build --release 2>&1

# 检查结果
if [ -f target/release/server ]; then
    echo "编译成功！"
    cp target/release/server /workspace/tl-monitor-server
    chmod +x /workspace/tl-monitor-server
    ls -lh /workspace/tl-monitor-server
else
    echo "编译失败"
    exit 1
fi

echo "=== 完成 ==="