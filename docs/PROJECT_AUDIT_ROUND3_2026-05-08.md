# TL 物品火价监控项目第三轮复查与优化清单

检查日期：2026-05-08  
复查范围：React/Vite 客户端、Tauri 桌面后端、内置独立采集 server、Docker 部署配置、`web-server` mock 服务、数据库赛季模型。  
复查目的：确认第二轮指出的问题是否已处理，并记录当前仍需要优化的点。

## 1. 总体结论

本轮修复继续有效：独立 server 的 path/query 解析已修正，`get_query_param` 不再从整条请求行截取，HTTP header 结束位置跨 buffer 偏移也已修复；`src-tauri` 格式检查恢复通过。前端类型检查、生产构建、Rust 编译、测试、Clippy、格式检查和 npm audit 当前都通过。

当前剩余问题主要集中在三类：

- 管理配置接口的鉴权改动还没有同步到所有调用方，内置 `admin.html` 配置加载会失败，桌面端 `ServerAdminPanel` 又仍走公开 `/api-config`。
- 独立 server 的新赛季 `started_at` 仍可缺省为 `0`，未知新赛季会导致后续采集无法可靠计算 `season_day`。
- 独立 server 的火价 Rust 抓取路径仍硬编码千岛 tag/spec/API URL，管理页保存的火价 API 配置不会实际生效。

## 2. 本次验证结果

| 检查项 | 命令 | 结果 | 说明 |
| --- | --- | --- | --- |
| 前端类型检查 | `npm run typecheck` | 通过 | TypeScript 当前无类型错误。 |
| 前端生产构建 | `npm run vite:build` | 通过 | 成功输出到 `dist-react/`。 |
| Tauri Rust 检查 | `cargo check --all-targets` in `src-tauri` | 通过 | 主库、bin、测试目标均可编译。 |
| Tauri Rust 测试 | `cargo test` in `src-tauri` | 通过 | 32 passed, 1 ignored。 |
| Tauri Clippy | `cargo clippy --all-targets -- -D warnings` in `src-tauri` | 通过 | 无 Clippy warning。 |
| Tauri 格式检查 | `cargo fmt -- --check` in `src-tauri` | 通过 | 上轮 `repo_history.rs` 格式问题已修复。 |
| `web-server` 检查 | `cargo check` in `web-server` | 通过 | mock 服务可编译。 |
| `web-server` 格式检查 | `cargo fmt -- --check` in `web-server` | 通过 | 当前格式 OK。 |
| npm 依赖审计 | `npm audit --audit-level=moderate` | 通过 | found 0 vulnerabilities。 |
| Docker 验证 | `docker ...` | 未执行 | 当前环境没有 `docker` 命令，只能做静态检查。 |

## 3. 已确认修复/改善

- `src-tauri/src/bin/server.rs` 已将 request target 拆分为 `path` 和 `query_string`，带 query 的 GET 路由不再天然 404。
- `get_query_param` 已改为只解析 `query_string`，上轮的 query 截取 panic 风险已修复。
- HTTP header 结束位置已改为 `header_end_pos = pos + 4`，跨 buffer 多加 `prev_len` 的问题已修复。
- `OPTIONS` 预检响应已补齐。
- `admin.html` 初始化赛季、归档赛季、保存 API 配置时已提交管理员密码。
- `admin.html` 的 API 配置保存路径已改为 `/admin/update-api-config`。
- 管理配置页的 HTTP 端口已设为 readonly，管理员密码文案也改为当前密码。
- Docker Compose、Dockerfile、端口、`curl` 健康检查工具和 README 执行目录已基本对齐。
- `get_db_record_count`、`get_section_items`、物品历史对比和前端趋势图已减少对静态 `supported_combinations()`/硬编码赛季时间的依赖。
- 火价对比已改为读取当前赛季最新记录，并返回 `is_stale`、`age_seconds`。
- `web-server/README.md` 已明确标注该服务是 mock/prototype，不用于生产。

## 4. 剩余优化项

### P1：内置 `admin.html` 配置加载与后端鉴权不匹配

位置：

- `src-tauri/src/bin/server.rs:529`
- `src-tauri/src/bin/server.rs:538`
- `src-tauri/src/server/admin.html:573`
- `src-tauri/src/server/admin.html:575`

问题：

- 后端已将 `GET /api/admin/config` 改为返回 401，并要求使用 `POST /api/admin/config` 携带密码。
- 但 `admin.html` 的 `loadConfig()` 仍在页面加载时直接 `fetch('/api/admin/config')`，没有提交密码。

影响：

- 内置管理页打开后无法加载当前 CORS、限流、API 配置等字段。
- 用户保存 API 配置时如果表单未被正确填充，可能提交空字符串或 `0`。

建议：

- 管理页先让用户输入管理员密码，再用 `POST /api/admin/config` 加载配置。
- 或者拆分公开配置和管理员配置：公开接口只返回非敏感状态，管理员配置必须显式登录/验证。
- 如果保留页面自动加载，必须避免把未加载的空表单直接保存。

### P1：`/api-config` 仍公开返回完整 API 配置

位置：

- `src-tauri/src/bin/server.rs:809`
- `src/lib/commands.ts:792`
- `src/components/dashboard/ServerAdminPanel.tsx:33`

问题：

- `/api/admin/config` 已加鉴权，但旧的 `GET /api-config` 仍公开返回 `state.config.api_config`。
- 桌面端 `ServerAdminPanel` 虽然要求用户先输入密码，但 `serverAdmin.getApiConfig()` 实际没有把密码发给后端，仍调用公开 `/api-config`。

影响：

- 如果 server 暴露在局域网，任何访问者都能读取千岛/罗四 API 配置。
- UI 上“需要密码才能加载配置”的安全感是假的。

建议：

- 删除或限制 `GET /api-config`，改为复用 `POST /api/admin/config`。
- 修改 `serverAdmin.getApiConfig(serverUrl, password)`，提交密码并从管理员配置接口读取。
- 给无密码读取 API 配置加回归测试，确保返回 401。

### P1：新赛季 `started_at` 仍可缺省为 `0`

位置：

- `src-tauri/src/server/db.rs:195`
- `src-tauri/src/server/db.rs:614`
- `src-tauri/src/server/admin.html:696`
- `src-tauri/src/server/admin.html:699`

问题：

- 默认迁移仍插入 `started_at = 0`，已知 `ss12/ss11` 可通过常量兜底，但数据库里仍保留无效值。
- `init_new_season` 对缺失 `started_at` 仍使用 `unwrap_or(0)`。
- 管理页文案已改成必填，但 JS 没有强制校验；用户留空时请求体不会包含 `started_at`。

影响：

- 对未知新赛季如 `ss13/ss14`，后续采集快照会因为无法得到有效开服时间而失败，或在部分接口里得到无效 `season_start`。
- 这会影响新赛季初始化后的第一条采集链路。

建议：

- 后端 `init_new_season` 应拒绝 `started_at <= 0`，不要默认写 `0`。
- 管理页在提交前校验 `started_at` 必填且为正整数。
- 默认插入已知赛季时直接写入常量时间，减少数据库中的无效状态。

### P1：火价 API 配置保存后不会影响 Rust 抓取路径

位置：

- `src-tauri/src/server/scraper.rs:120`
- `src-tauri/src/server/scraper.rs:122`
- `src-tauri/src/server/scraper.rs:146`
- `src-tauri/src/server/scraper.rs:147`
- `src-tauri/src/server/scraper.rs:168`

问题：

- `scrape_fire_price` 参数名是 `_config`、`_endpoints`，当前没有使用 server 配置。
- `scrape_via_rust` 内部硬编码普通/专家的 `tag_id`、`spec_id`。
- 千岛 API URL 也硬编码为 `https://api.qiandao.com/c2c-web/v1/common/currency-spu-price-list`。

影响：

- 管理页保存“火价 API 配置”后，实际 Rust 抓取仍使用代码里的固定值。
- 只有罗四物品接口配置当前确实参与了抓取。

建议：

- 将 `scrape_via_rust(mode)` 改为接收 `ApiConfig` 和 `ApiEndpoints`。
- 根据普通/专家模式从 `api_config.qiandao_*` 读取 tag/spec。
- 使用 `api_endpoints.qiandao + api_endpoints.qiandao_fire_endpoint` 拼接 URL。
- 保存配置后若仍需重启生效，UI 文案保持一致；若要热更新，需要同步更新内存配置。

### P1：HTTP body 不完整时仍可能越界 panic

位置：

- `src-tauri/src/bin/server.rs:322`
- `src-tauri/src/bin/server.rs:324`
- `src-tauri/src/bin/server.rs:401`
- `src-tauri/src/bin/server.rs:404`

问题：

- 如果客户端声明了较大的 `Content-Length`，但提前断开连接，读取循环会在 `Ok(0)` 时 `break`。
- 后续构造 `request_body` 时直接 slice 到 `header_end_pos + content_length`。
- 当实际 body 未读满时，这个范围可能超过 `buffer.len()`。

影响：

- 恶意或异常客户端可以造成 server task panic。

建议：

- 在读取结束后检查 `buffer.len() >= header_end_pos + content_length`，不足时返回 400。
- 构造 body 时使用实际可用范围，或只在完整 body 到达后解析 JSON。
- 给读取加 timeout，避免慢速连接长期占用 task。

### P2：管理员配置保存仍是“写文件，运行时不生效”

位置：

- `src-tauri/src/bin/server.rs:600`
- `src-tauri/src/bin/server.rs:607`
- `src-tauri/src/server/admin.html:758`
- `src-tauri/src/server/admin.html:775`

问题：

- `/api/admin/update-config` 保存了新配置文件，但 `state.config` 仍是启动时 clone 出来的旧值。
- CORS、限流等逻辑继续读旧的内存配置。
- UI 保存成功文案仍是“配置已保存”，没有明确“重启后生效”。

影响：

- 用户可能以为修改 CORS/限流后立即生效，实际需要重启。

建议：

- 最小改法：成功文案改为“配置已保存，重启后生效”。
- 完整改法：将 `ServerState.config` 改为 `RwLock<ServerConfig>`，保存后同步更新内存配置和 rate limiter。

### P2：Docker 配置示例仍使用公开占位密码

位置：

- `server-docker/config/server_config.yaml:8`

问题：

- 示例配置的 `admin_password` 是 `change_this_password`。
- 后端只拒绝空密码，不拒绝常见占位值。

影响：

- 用户如果直接部署示例配置，局域网内管理接口会使用可猜到的密码。

建议：

- 启动时检测 `change_this_password`、`admin123` 等占位密码并拒绝启用管理员接口。
- 或首次启动生成随机密码并只输出一次。

### P2：Docker 镜像仍未验证真实构建

位置：

- `server-docker/Dockerfile`
- `server-docker/docker-compose.yml`

问题：

- 当前环境没有 `docker` 命令，无法确认 `docker build -f server-docker/Dockerfile .` 真实通过。
- Dockerfile 没有安装 Node，也没有复制 `qiandao_fire.cjs`；如果 Rust 火价抓取失败，Node fallback 在容器内不可用。

建议：

- 在有 Docker 的环境补跑：

```bash
docker build -f server-docker/Dockerfile .
docker compose -f server-docker/docker-compose.yml config
docker compose -f server-docker/docker-compose.yml up --build
```

- 明确容器是否需要 Node fallback：不需要就删除 fallback；需要就复制资源并安装 Node。
- 将 Docker 构建加入 CI。

### P3：前端/安全基线可以继续收紧

位置：

- `tsconfig.json`
- `src/tsconfig.json`
- `src-tauri/tauri.conf.json`
- `src/components/dashboard/AIAnalysisPage.tsx`

建议：

- 前端仍是 `strict: false`，建议先收紧跨端 DTO、server 同步返回、趋势/对比数据类型。
- Release CSP 应拆分 dev/release，减少 `unsafe-eval`、`unsafe-inline`、`localhost:*` 的生产暴露。
- 本地 AI token 如果继续放在 localStorage，应在 UI 明确提示明文存储；更理想是迁移到系统 keychain。

## 5. 推荐处理顺序

1. 修复 `admin.html` 的配置加载流程，改用带密码的 `POST /api/admin/config`。
2. 删除或鉴权 `/api-config`，并同步修改 `ServerAdminPanel`。
3. 后端拒绝 `started_at <= 0` 的新赛季初始化，前端同步校验必填。
4. 让火价 Rust 抓取路径真正使用 `ApiConfig` 和 `ApiEndpoints`。
5. 补 HTTP body 未读满时的 400 处理和读取超时。
6. 明确管理员配置保存是否热更新；不能热更新就统一提示重启后生效。
7. 拒绝 Docker 示例占位密码，并在 Docker 环境实测构建。

## 6. 建议补充的回归测试

- `GET /fire-history?mode=normal&limit=24` 返回 200 且能正确解析 `mode/limit`。
- `GET /items-history-all?mode=expert&limit=10` 返回 200 且能正确解析 `mode/limit`。
- `POST /api/admin/config` 无密码/错密码返回 401，正确密码返回完整配置。
- `GET /api-config` 不能无密码返回完整 API 配置。
- `init_new_season` 缺少有效 `started_at` 时返回明确错误。
- HTTP body 少于 `Content-Length` 时返回 400，不 panic。
- Docker CI 至少覆盖 `docker build -f server-docker/Dockerfile .`。

## 7. 当前工作区备注

复查时工作区已有大量未提交改动，包括客户端页面、Tauri server、Docker 配置、README、删除旧资源/页面等。本报告没有回滚或覆盖这些业务改动，只新增本报告文件。
