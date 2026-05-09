#!/bin/bash
# TL Monitor Server - 在 NAS 上直接编译 (原生编译)
# 使用 Rust Docker 镜像在 NAS 上原生编译 ARM64 版本

set -e

echo "========================================"
echo "TL Monitor Server - NAS 原生编译"
echo "========================================"

# 配置
NAS_SSH_PORT="10039"
NAS_SSH_USER="15510607744"
NAS_SSH_HOST="100.124.122.65"
NAS_SSH_PASS="!Mjx452212889"
NAS_PATH="/data_s001/data/udata/real/15510607744/Docker/tl-monitor"
GITHUB_REPO="https://github.com/maojiaxu8039/TL-item-monitor-Tauri.git"

# SSH 连接函数
ssh_cmd() {
    sshpass -p "$NAS_SSH_PASS" ssh -o StrictHostKeyChecking=no -o PubkeyAuthentication=no -p $NAS_SSH_PORT $NAS_SSH_USER@$NAS_SSH_HOST "$1"
}

# 停止旧容器
echo "[1/7] 停止旧容器..."
ssh_cmd "sudo docker stop tl-monitor-server 2>/dev/null || true; sudo docker rm tl-monitor-server 2>/dev/null || true"

# 创建编译目录
echo "[2/7] 创建编译目录..."
ssh_cmd "mkdir -p $NAS_PATH/tl-build"

# 克隆代码
echo "[3/7] 克隆代码..."
ssh_cmd "cd $NAS_PATH/tl-build && git clone $GITHUB_REPO . || git pull"

# 创建 Rust 编译容器
echo "[4/7] 创建 Rust 编译环境 (这可能需要几分钟)..."
ssh_cmd "sudo docker run -d --name tl-monitor-build \
    -v $NAS_PATH/tl-build:/workspace \
    -w /workspace \
    rust:latest \
    sleep infinity"

# 安装 ARM64 target
echo "[5/7] 安装 ARM64 编译目标..."
ssh_cmd "sudo docker exec tl-monitor-build bash -c 'rustup target add aarch64-unknown-linux-gnu'"

# 编译
echo "[6/7] 开始编译 (这可能需要 10-20 分钟)..."
ssh_cmd "sudo docker exec tl-monitor-build bash -c 'cd /workspace/server-standalone && cargo build --release --target aarch64-unknown-linux-gnu'"

# 复制结果
echo "[7/7] 复制编译结果..."
ssh_cmd "sudo docker cp tl-monitor-build:/workspace/server-standalone/target/aarch64-unknown-linux-gnu/release/tl-monitor-server $NAS_PATH/tl-monitor-server"
ssh_cmd "sudo chmod +x $NAS_PATH/tl-monitor-server"

# 清理
echo "清理编译容器..."
ssh_cmd "sudo docker stop tl-monitor-build && sudo docker rm tl-monitor-build"
ssh_cmd "rm -rf $NAS_PATH/tl-build"

# 验证
echo ""
echo "========================================"
echo "编译完成！验证结果："
echo "========================================"
ssh_cmd "file $NAS_PATH/tl-monitor-server"
ssh_cmd "ldd $NAS_PATH/tl-monitor-server 2>&1 | head -10"

# 启动服务
echo ""
echo "启动服务..."
ssh_cmd "sudo docker run -d --name tl-monitor-server --restart unless-stopped -p 38457:8080 \
    -v $NAS_PATH/data:/data -v $NAS_PATH/config:/config -v $NAS_PATH/resources:/resources \
    -e TL_RESOURCES_DIR=/resources -w /data debian:stable-slim \
    ./tl-monitor-server"

sleep 3
echo ""
echo "服务日志："
ssh_cmd "sudo docker logs --tail 30 tl-monitor-server"

echo ""
echo "========================================"
echo "部署完成！"
echo "========================================"
echo "访问地址: http://NAS_IP:38457"