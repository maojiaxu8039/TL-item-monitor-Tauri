# 复查后仍需修改的问题清单

本文件记录本次复查后仍需要处理的发布前问题。当前项目已有明显改进，但下面几项在发布前仍建议修完。

## P0：发布前阻塞项

### 1. 空库迁移仍然不可靠

当前风险：

- `001_initial.sql` 已经创建了 `strategy_outputs.realtime_value`。
- `010_add_realtime_value_to_outputs.sql` 仍然直接执行：

```sql
ALTER TABLE strategy_outputs ADD COLUMN realtime_value REAL NOT NULL DEFAULT 0;
```

复查时用空库执行后会报：

```text
duplicate column name: realtime_value
```

另外：

- `001_initial.sql` 创建的 `item_realtime_prices` 列是 `item_name` / `price`。
- 现有 Rust 代码和 `011_create_item_realtime_prices.sql` 期望列是 `name` / `fire_price`。
- `011_create_item_realtime_prices.sql` 使用 `CREATE TABLE IF NOT EXISTS`，不会修复已经由 `001_initial.sql` 创建出的旧结构。

需要修改：

- 把 `010` 改为 Rust 侧条件迁移，或删除 `001_initial.sql` 中重复字段，确保空库不会重复加列。
- 修正 `001_initial.sql` 中 `item_realtime_prices` 的初始 schema，使其直接使用 `name` / `fire_price`。
- 或在 `011` 中真正检测旧列并重建/迁移表，而不是只 `CREATE TABLE IF NOT EXISTS`。
- 增加一个 fresh SQLite migration smoke test：空库完整跑迁移后检查关键列。

涉及文件：

- `src-tauri/src/db/migrations/001_initial.sql`
- `src-tauri/src/db/migrations/010_add_realtime_value_to_outputs.sql`
- `src-tauri/src/db/migrations/011_create_item_realtime_prices.sql`
- `src-tauri/src/app.rs`

### 2. `server-standalone` 编译失败

复查命令：

```bash
cargo test
```

目录：

```text
server-standalone/
```

错误：

```text
error[E0004]: non-exhaustive patterns: Ok(Err(_)) not covered
```

位置：

```text
server-standalone/src/main.rs:424
```

原因：

`tokio::time::timeout(..., stream.read(...)).await` 的返回类型是：

```rust
Result<Result<usize, std::io::Error>, Elapsed>
```

当前 match 覆盖了：

- `Ok(Ok(0))`
- `Ok(Ok(n))`
- `Err(e)`

但缺少：

- `Ok(Err(e))`

需要修改：

- 增加 `Ok(Err(e))` 分支，记录读取失败并返回。
- 修改后重新运行 `cargo test` 和 release build。

涉及文件：

- `server-standalone/src/main.rs`

### 3. 桌面端完整打包仍失败

复查命令：

```bash
npm run build
```

结果：

- `npm run typecheck` 通过。
- `npm run vite:build` 通过。
- Tauri release binary 构建成功。
- `.app` 已生成。
- DMG 阶段失败：

```text
failed to bundle project error running bundle_dmg.sh
```

同时 Tauri 给出警告：

```text
The bundle identifier "com.tlmonitor.app" ... ends with `.app`.
```

需要修改：

- 调查 `bundle_dmg.sh` 失败原因，必要时先只构建 `.app`，或调整 macOS DMG 配置。
- 把 `tauri.conf.json` 的 identifier 从 `com.tlmonitor.app` 改为不以 `.app` 结尾的形式，例如 `com.tlmonitor.desktop`。
- 修改后重新运行 `npm run build`。

涉及文件：

- `src-tauri/tauri.conf.json`

## P1：发布前强烈建议修

### 4. `TL_ADMIN_PASSWORD` 环境变量目前不会生效

当前配置文件中使用：

```yaml
admin_password: "${TL_ADMIN_PASSWORD:-changeme}"
```

但 `server-standalone/src/config.rs` 只是读取 YAML 并反序列化，没有做环境变量展开。因此服务端会把这整段字符串当成真实密码。

需要修改：

- 在 `server-standalone/src/config.rs` 加入环境变量覆盖逻辑，例如读取 `TL_ADMIN_PASSWORD` 后覆盖 `config.admin_password`。
- 或在部署文档中要求用户直接写入真实配置文件，不使用 `${...}` 占位符。
- 如果继续支持环境变量，`server-docker/docker-compose.yml` 需要显式传入 `TL_ADMIN_PASSWORD`。

涉及文件：

- `server-standalone/src/config.rs`
- `server-docker/docker-compose.yml`
- `server-docker/config/server_config.yaml`
- `src-tauri/server_config.yaml`

### 5. 文档里仍有旧密码示例

当前仍存在示例：

```text
{"password":"8039"}
```

位置：

```text
server-docker/README.md
```

需要修改：

- 改成占位示例，例如：

```json
{"password":"你的管理员密码"}
```

或：

```bash
-d "{\"password\":\"$TL_ADMIN_PASSWORD\"}"
```

### 6. `.gitignore` 仍缺 SQLite WAL 文件

当前工作区曾出现：

```text
data/tl_monitor.db-shm
data/tl_monitor.db-wal
```

需要修改：

在 `.gitignore` 加入：

```gitignore
*.db-wal
*.db-shm
```

## P2：可顺手处理

### 7. ESLint 仍有 1 个 warning

复查命令：

```bash
npm run lint
```

结果：

```text
src/components/ui/button.tsx
Fast refresh only works when a file only exports components.
```

需要修改：

- 将非组件导出移到单独文件。
- 或调整导出方式，让该文件只导出 React 组件。

### 8. 发布文档和 Docker 路径需要统一

当前 `server-docker/Dockerfile` 已标注弃用，但 `docker-compose.yml` 仍指向：

```yaml
image: ghcr.io/maojiaxu8039/tl-monitor-server:latest
```

需要确认：

- 正式服务端是否只走 `server-standalone` + GitHub Actions 产物。
- `server-docker/README.md` 是否仍作为正式部署文档。
- 如果 Docker 部署继续保留，需要确保镜像构建链路、配置、密码注入和健康检查都可用。

## 本次通过项

以下检查已经通过：

- `npm run typecheck`
- `npm run vite:build`
- `cargo test` in `src-tauri`
- 当前 SQLite `PRAGMA integrity_check`
- 当前 SQLite `PRAGMA foreign_key_check`

以下检查未完全通过：

- `npm run lint`：0 error，1 warning
- `cargo test` in `server-standalone`：编译失败
- `npm run build`：DMG 打包失败
- 空库迁移 smoke test：失败

## 建议修复顺序

1. 先修空库迁移，保证新安装用户能启动。
2. 修 `server-standalone` 编译错误。
3. 修 `TL_ADMIN_PASSWORD` 配置覆盖和文档旧密码。
4. 修 DMG 打包和 Tauri identifier。
5. 补 `.gitignore` 的 WAL 文件规则。
6. 最后清理 lint warning 和发布文档。
