#!/usr/bin/env bash
set -e

echo "========================================"
echo "TL Monitor Server - 完整部署脚本"
echo "========================================"

NAS_PATH="/data_s001/data/udata/real/15510607744/Docker/tl-monitor"
GITHUB_REPO="https://github.com/maojiaxu8039/TL-item-monitor-Tauri.git"

# 停止旧容器
echo "[1/8] 停止旧容器..."
sudo docker stop tl-monitor-server 2>/dev/null || true
sudo docker rm tl-monitor-server 2>/dev/null || true
sudo docker stop tl-monitor-build 2>/dev/null || true
sudo docker rm tl-monitor-build 2>/dev/null || true

# 创建编译目录
echo "[2/8] 创建目录..."
sudo mkdir -p $NAS_PATH/tl-build
sudo mkdir -p $NAS_PATH/resources

# 克隆代码
echo "[3/8] 克隆代码..."
cd $NAS_PATH/tl-build
if [ -d .git ]; then
    git pull
else
    git clone --depth 1 $GITHUB_REPO .
fi

# 创建 Rust 编译容器
echo "[4/8] 创建 Rust 编译环境..."
sudo docker run -d --name tl-monitor-build \
    -v $NAS_PATH/tl-build:/workspace \
    -w /workspace \
    rust:bookworm \
    sleep infinity

# 安装 ARM64 target
echo "[5/8] 安装编译目标..."
sudo docker exec tl-monitor-build bash -c 'rustup target add aarch64-unknown-linux-gnu'

# 编译 (需要 10-20 分钟)
echo "[6/8] 编译中 (这可能需要 10-20 分钟)..."
sudo docker exec tl-monitor-build bash -c 'cd /workspace/server-standalone && cargo build --release --target aarch64-unknown-linux-gnu'

# 复制结果
echo "[7/8] 复制编译结果..."
sudo docker cp tl-monitor-build:/workspace/server-standalone/target/aarch64-unknown-linux-gnu/release/tl-monitor-server $NAS_PATH/tl-monitor-server
sudo chmod +x $NAS_PATH/tl-monitor-server

# 下载 qiandao_fire.cjs
echo "[8/8] 下载 qiandao_fire.cjs..."
curl -sL https://raw.githubusercontent.com/maojiaxu8039/TL-item-monitor-Tauri/main/src-tauri/resources/qiandao_fire.cjs -o $NAS_PATH/resources/qiandao_fire.cjs
sudo chmod +x $NAS_PATH/resources/qiandao_fire.cjs

# 清理编译容器
echo "清理编译容器..."
sudo docker stop tl-monitor-build
sudo docker rm tl-monitor-build
rm -rf $NAS_PATH/tl-build

# 验证
echo ""
echo "========================================"
echo "编译完成！"
echo "========================================"
file $NAS_PATH/tl-monitor-server
echo ""

# 启动服务 (使用 rust:bookworm 作为运行时，包含 GLIBC 兼容)
echo "启动服务..."
sudo docker run -d --name tl-monitor-server --restart unless-stopped -p 38457:8080 \
    -v $NAS_PATH/tl-monitor-server:/data/tl-monitor-server:ro \
    -v $NAS_PATH/data:/data \
    -v $NAS_PATH/config:/config \
    -v $NAS_PATH/resources:/resources \
    -e TL_RESOURCES_DIR=/resources \
    -w /data \
    rust:bookworm bash -c '
        # 安装 Node.js
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs
        
        # 启动服务
        chmod +x /data/tl-monitor-server
        ./tl-monitor-server
    '

sleep 5
echo ""
echo "服务状态："
sudo docker ps | grep tl-monitor
echo ""
echo "服务日志："
sudo docker logs --tail 30 tl-monitor-server

echo ""
echo "========================================"
echo "部署完成！"
echo "========================================"
echo "访问地址: http://NAS_IP:38457"
echo "管理界面: http://NAS_IP:38457/admin"
echo "========================================"