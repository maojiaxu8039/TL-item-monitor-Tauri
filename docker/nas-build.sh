#!/bin/bash
# TL Monitor Server - 在 NAS 上编译 ARM64 版本
# 运行此脚本在极空间的 Docker 容器中编译

set -e

echo "========================================"
echo "TL Monitor Server - NAS 编译脚本"
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
echo "[1/6] 停止旧容器..."
ssh_cmd "sudo docker stop tl-monitor-server 2>/dev/null || true; sudo docker rm tl-monitor-server 2>/dev/null || true"

# 创建编译容器
echo "[2/6] 创建 Rust 编译环境..."
ssh_cmd "sudo docker run -d --name tl-monitor-build \
    -v $NAS_PATH:/workspace \
    rustembedded/cross:armv7-unknown-linux-gnueabihf \
    sleep infinity"

# 克隆代码
echo "[3/6] 克隆/更新代码..."
ssh_cmd "sudo docker exec tl-monitor-build bash -c 'cd /workspace && \
    if [ -d .git ]; then git pull; else git clone $GITHUB_REPO .; fi'"

# 编译
echo "[4/6] 编译 ARM64 版本..."
ssh_cmd "sudo docker exec tl-monitor-build bash -c 'cd /workspace/server-standalone && \
    rustup target add aarch64-unknown-linux-gnu && \
    cargo build --release --target aarch64-unknown-linux-gnu'"

# 复制二进制文件
echo "[5/6] 复制编译结果..."
ssh_cmd "sudo docker exec tl-monitor-build bash -c 'cp /workspace/server-standalone/target/aarch64-unknown-linux-gnu/release/tl-monitor-server /workspace/'"
ssh_cmd "sudo docker exec tl-monitor-build bash -c 'chmod +x /workspace/tl-monitor-server'"

# 验证
echo "[6/6] 验证编译结果..."
ssh_cmd "file $NAS_PATH/tl-monitor-server"
ssh_cmd "ldd $NAS_PATH/tl-monitor-server 2>&1 | head -10"

# 清理
echo "清理编译容器..."
ssh_cmd "sudo docker stop tl-monitor-build && sudo docker rm tl-monitor-build"

echo ""
echo "========================================"
echo "编译完成！"
echo "========================================"
echo "二进制文件位置: $NAS_PATH/tl-monitor-server"

# 询问是否启动服务
read -p "是否启动服务？(y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "启动服务..."
    ssh_cmd "sudo docker run -d --name tl-monitor-server --restart unless-stopped -p 38457:8080 \
        -v $NAS_PATH/data:/data -v $NAS_PATH/config:/config -v $NAS_PATH/resources:/resources \
        -e TL_RESOURCES_DIR=/resources -w /data debian:stable-slim \
        ./tl-monitor-server"
    ssh_cmd "sudo docker logs --tail 20 tl-monitor-server"
fi

echo ""
echo "服务访问地址: http://NAS_IP:38457"