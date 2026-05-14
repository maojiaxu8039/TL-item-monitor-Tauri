# 启动指南

## 快速启动

要启动 Tauri 应用，请使用以下命令：

```bash
cd /Users/mc/.openclaw/workspace/TL-item-monitor-Tauri
npm run tauri dev
```

这将：
1. 启动前端开发服务器（Vite on localhost:5173）
2. 启动后端 Rust 服务器
3. 自动打开应用窗口

## 预期行为

### 应用启动时应该看到：
1. **加载动画** - 页面顶部显示骨架屏加载动画（"加载中..."）
2. **Dashboard 统计卡片** - 4个统计卡片显示：
   - 监控物品数量
   - 当前火价
   - 历史火价统计
   - 策略收益

### 后端日志会显示：
- 数据库迁移状态
- 物品数据加载状态
- 后台任务启动信息
- API 请求日志

## 故障排查

### 如果页面显示空白：
1. 检查浏览器控制台（F12）是否有错误
2. 确保使用 `npm run tauri dev` 而不是 `cargo run`
3. 检查后端是否正常运行

### 如果控制台显示 "Could not connect to the server"：
1. 这是正常的，在应用初始化时会短暂出现
2. 等待 5-10 秒，后台任务会自动连接
3. 如果长时间未消失，检查：
   - API 服务器是否可达：`curl http://115.231.176.101:8080/get?season_id=1401`
   - 后端 Rust 服务是否启动成功

### 检查后端日志：
```bash
cd /Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/src-tauri
RUST_LOG=info cargo run
```

查看日志中的关键信息：
- `[INFO] Items table already has N records` - 数据库已有数据
- `[DEBUG] Database already has N items, waiting 5s before first scrape` - 后台任务启动延迟
- `[LUOSI] Response received` - API 请求成功

## 数据加载流程

1. **启动阶段（0-2秒）**：
   - 数据库迁移
   - 检查数据库是否有物品数据
   - 如果有，跳过启动时加载

2. **初始化阶段（2-5秒）**：
   - 启动后台任务
   - 显示加载动画
   - 前端连接后端

3. **后台更新（5秒后）**：
   - 第一次 API 请求获取最新数据
   - 更新数据库
   - 通知前端刷新显示

## 常见问题

Q: 应用启动很慢怎么办？
A: 检查 API 服务器是否可达。如果 API 响应慢，后台任务会等待超时。

Q: 数据不更新怎么办？
A: 检查配置文件中的 `auto_reload` 设置为 `true`。

Q: 页面显示 "加载中..." 但长时间不消失？
A: 检查后端是否启动成功，查看后端日志是否有错误信息。
