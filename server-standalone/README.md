# TL Monitor Server

游戏物品价格数据采集服务器，通过 HTTP API 提供数据给 TorchScan 客户端。

## 快速部署

详细部署指南：[docs/ZSPACE_DEPLOYMENT_GUIDE.md](../docs/ZSPACE_DEPLOYMENT_GUIDE.md)

### 核心流程

```
代码 push → GitHub Actions 构建 artifact → 下载 → 上传到极空间 → 重启容器
```

### 触发构建

```bash
gh workflow run build-server-arm64.yml
```

### 下载构建产物

```bash
RUN_ID=$(gh run list --workflow=build-server-arm64.yml --limit 1 --json databaseId --jq '.[0].databaseId')
mkdir -p /tmp/tl-build
gh run download $RUN_ID --name linux-arm64-server --dir /tmp/tl-build
```

### artifact 内容

```
linux-arm64-server/
├── tl-monitor-server           # ARM64 二进制
├── server_config.example.yaml  # 配置示例
└── resources/
    ├── item_id_mapping.json
    ├── qiandao_fire.cjs
    └── qiandao_fire.mjs
```

## 本地开发

```bash
cd server-standalone
cargo check
cargo run
```

本地构建产物只适合本机运行，不能用于 NAS 部署。
