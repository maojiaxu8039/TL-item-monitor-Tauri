# TL Monitor 项目评估与优化报告

**生成日期：** 2026-05-13
**分析范围：** React 前端、Tauri/Rust 后端、SQLite 数据库、部署配置

---

## 一、项目概览

| 维度 | 评估 |
|---|---|
| **项目类型** | 跨平台桌面应用（支持客户端 + 服务端双模式） |
| **目标用户** | 火炬之光游戏玩家（10人以内小范围使用） |
| **技术栈** | React 19 + TypeScript / Tauri 2 + Rust / SQLite / Docker |
| **代码规模** | 前端 ~30 个组件，后端 ~18 个命令模块 + 15 个数据库迁移 |
| **当前状态** | 功能基本完成，存在影响新用户安装的 P0 问题 |

---

## 二、技术栈评分

| 层级 | 技术选型 | 评分 | 说明 |
|---|---|---|---|
| 前端框架 | React 19 + Vite 6 | ⭐⭐⭐⭐ | 现代化栈，支持 SSR 代码分割 |
| 桌面框架 | Tauri 2 | ⭐⭐⭐⭐ | 比 Electron 更轻量，Rust 后端性能好 |
| 后端语言 | Rust | ⭐⭐⭐⭐⭐ | 内存安全、高性能、适合 IO 密集型任务 |
| 数据库 | SQLite | ⭐⭐⭐ | 轻量但 WAL 模式需要特殊处理 |
| 状态管理 | React Query + Context | ⭐⭐⭐⭐ | 适合数据获取场景，避免 Redux 过度工程化 |
| 部署方式 | Docker | ⭐⭐⭐⭐ | 服务端容器化合理 |

**总分：4.2 / 5**

---

## 三、架构评估

### 3.1 整体架构（良好）

```
┌──────────────────────────────────────────────────┐
│                    客户端                         │
│  React UI → Tauri Commands → Rust Core          │
│                              ├─ db/repos         │
│                              ├─ scraper          │
│                              ├─ scheduler        │
│                              └─ services         │
└──────────────────────────────────────────────────┘
```

**优点：**
- 分层清晰，前后端通过 Tauri Commands 桥接
- React Query 做数据缓存，避免重复请求
- Lazy Loading + ErrorBoundary 提高稳定性
- Rust 模块化好（commands/db/scheduler/scraper/services）

**缺点：**
- 桌面端和服务端代码重复（scraper/schema 部分）
- `server-standalone` 和 `server-docker` 两套服务端入口，维护成本高

### 3.2 前端架构（良好）

| 指标 | 评估 |
|---|---|
| 代码组织 | ✅ 按 dashboard/layout/ui 分层，结构清晰 |
| 组件复用 | ✅ 有独立 UI 组件库（Button、Card、Dialog 等） |
| 状态管理 | ✅ React Query + Context，避免 Redux 过度复杂 |
| 代码分割 | ✅ 13 个页面组件全部 Lazy Loading |
| TypeScript | ✅ 有类型定义，前后端类型通过 commands.ts 对应 |

**可改进：**
- `tsconfig.json` 关闭了 `strict: true`，类型检查不完全
- `noUnusedLocals: false`，未使用的变量不会报错
- 部分组件内仍有 `console.log` 调试输出

### 3.3 后端架构（优秀）

| 指标 | 评估 |
|---|---|
| 错误处理 | ✅ 使用 thiserror 枚举化错误 |
| 数据库抽象 | ✅ Repository 模式，15 个迁移文件 |
| 并发安全 | ✅ 使用 parking_lot RwLock |
| 测试覆盖 | ✅ worth_service 有单元测试 |
| 日志追踪 | ✅ tracing crate + 分级日志 |

**可改进：**
- 数据库迁移事务不完整
- 缺少迁移 smoke test

---

## 四、功能完整性评估

### 4.1 已实现功能

| 功能模块 | 完成度 | 说明 |
|---|---|---|
| 火价采集 | 90% | 洛社 API + 千岛脚本 |
| 物品采集 | 90% | 正常/专家模式 |
| 实时监控 | 85% | 定时任务 + 缓存 |
| 策略管理 | 80% | 成本/收益计算 |
| 套利比价 | 75% | 配方管理 + 利润计算 |
| 告警系统 | 70% | 规则 + 事件记录 |
| 数据同步 | 70% | 桌面端 ↔ 服务端 |
| 导入导出 | 80% | CSV + JSON |
| 系统托盘 | 80% | 最小化 + 通知 |
| 赛季管理 | 80% | 多赛季切换 + 归档 |

### 4.2 缺失/不完整功能

- ❌ 专家模式物品数据为空
- ❌ 无自动数据清理策略
- ❌ 无增量备份
- ❌ AI 分析页面依赖外部 OpenClaw 服务

---

## 五、代码质量评估

### 5.1 前端（得分：7.5 / 10）

| 维度 | 得分 | 说明 |
|---|---|---|
| 类型安全 | 7 | 关闭了 strict 模式 |
| 代码复用 | 9 | UI 组件库设计良好 |
| 性能优化 | 8 | React Query 缓存合理 |
| 安全性 | 7 | CSP 配置偏宽 |
| 代码风格 | 8 | ESLint + Prettier（可选） |

**主要问题：**
- `src/components/ui/button.tsx` Fast Refresh 警告
- 部分组件未清理 `console.log`
- TypeScript 严格模式未开启

### 5.2 后端 Rust（得分：8.5 / 10）

| 维度 | 得分 | 说明 |
|---|---|---|
| 内存安全 | 10 | Rust 所有权保证 |
| 错误处理 | 9 | thiserror 枚举化 |
| 并发安全 | 9 | RwLock 保护共享状态 |
| 测试覆盖 | 8 | 有单元测试，但覆盖不全 |
| 代码可读性 | 9 | 模块划分清晰 |

**主要问题：**
- SS12 开服时间测试失败（时间戳不一致）
- 部分模块缺少单元测试
- 迁移文件依赖关系复杂

---

## 六、数据库评估

### 6.1 Schema 设计（良好）

| 指标 | 评估 |
|---|---|
| 表结构 | ✅ 有索引、有外键关联 |
| 迁移体系 | ⚠️ 存在重复列定义 |
| 数据完整性 | ✅ foreign_keys PRAGMA 开启 |
| 性能 | ✅ 有复合索引 |

### 6.2 当前数据量

| 表 | 行数 | 说明 |
|---|---|---|
| `items_normal` | 1,966 | 实时物品 |
| `items_expert` | 0 | 专家物品（空） |
| `fire_price_normal` | 735 | 实时火价 |
| `item_realtime_prices` | 115,994 | 历史价格（最大表） |

### 6.3 关键问题

**P0：迁移体系不稳定**

1. `001_initial.sql` 和后续迁移存在列冲突
   - `strategy_outputs.realtime_value` 在 `001_initial.sql` 创建后，`010_add_realtime_value_to_outputs.sql` 又执行 `ALTER TABLE ADD COLUMN`
   - 干净安装会报 `duplicate column name`

2. `item_realtime_prices` 表结构不一致
   - `001_initial.sql` 定义为 `item_name, price`
   - `011_create_item_realtime_prices.sql` 和 Rust repo 使用 `name, fire_price`
   - `CREATE TABLE IF NOT EXISTS` 不会修正旧表结构

3. 迁移未包进事务，中途失败会留下半迁移状态

---

## 七、安全评估

| 风险项 | 严重程度 | 说明 |
|---|---|---|
| 默认密码硬编码 | 🔴 高 | `server_config.yaml` 中有 `admin_password: "8039"` |
| TLS 校验关闭 | 🟡 中 | `qiandao.rs` 使用 `danger_accept_invalid_certs` |
| Tauri 权限宽泛 | 🟡 中 | 允许 `$HOME/**` 读写、shell open |
| CSP 配置 | 🟡 中 | 有 `unsafe-inline`、`unsafe-eval` |

---

## 八、性能评估

| 指标 | 评估 |
|---|---|
| 启动性能 | ⚠️ 依赖外部 API，首次启动可能慢 |
| 查询性能 | ✅ 当前数据量下（<2k 物品）无问题 |
| 内存占用 | ✅ Rust 后端 + SQLite 轻量 |
| 包体积 | ✅ Tauri 比 Electron 小很多 |
| React 渲染 | ✅ 有 React Query 缓存 + 代码分割 |

**潜在瓶颈：**
- `item_realtime_prices` 表 11.5 万行，需要数据保留策略
- `LIKE '%keyword%'` 搜索后期可改 FTS5
- 定时快照任务可能影响前台响应

---

## 九、CI/CD 评估

### 9.1 当前 CI（基础）

| 检查项 | 状态 |
|---|---|
| Windows 构建 | ✅ |
| macOS 构建 | ✅ |
| Docker 构建 | ✅ |
| TypeScript 检查 | ✅ (beforeBuildCommand) |
| ESLint | ✅ |
| Rust 测试 | ⚠️ 1 个失败 |

### 9.2 缺失的质量门禁

- ❌ 无 fresh SQLite 迁移 smoke test
- ❌ 无数据库完整性自动检查
- ❌ 无代码覆盖率报告
- ❌ 服务端和桌面端构建流程未统一

---

## 十、问题汇总

### P0（阻塞发布）

| # | 问题 | 影响 | 文件 |
|---|---|---|---|
| P0-1 | 数据库迁移在干净环境下失败 | 新用户无法正常安装 | `migrations/*.sql` |
| P0-2 | Dockerfile 构建目标错误 | 服务端无法正常构建 | `server-docker/Dockerfile` |
| P0-3 | SS12 时间常量测试失败 | 赛季天数计算不准确 | `core/constants.rs` |

### P1（强烈建议修）

| # | 问题 | 影响 | 文件 |
|---|---|---|---|
| P1-1 | 默认管理员密码硬编码 | 安全风险 | `server_config.yaml` |
| P1-2 | WAL 备份恢复不完整 | 备份可能不完整 | `commands/import_export.rs` |
| P1-3 | Tauri 权限过于宽泛 | 安全性风险 | `capabilities/default.json` |
| P1-4 | TLS 校验关闭 | 中间人攻击风险 | `scraper/qiandao.rs` |

### P2（可优化）

| # | 问题 | 建议 | 文件 |
|---|---|---|---|
| P2-1 | 启动依赖外部 API | 先显示缓存，后台刷新 | `app.rs` |
| P2-2 | 前后端代码重复 | 抽取公共 crate | `scraper/` |
| P2-3 | TypeScript strict 未开 | 开启严格模式 | `tsconfig.json` |
| P2-4 | 缺少集成测试 | 增加迁移 smoke test | `db/` |

---

## 十一、优化建议（按优先级）

### 第一阶段：修复 P0（发布阻塞）

1. **统一迁移体系**
   - 方案 A：更新 `001_initial.sql` 为最终 schema，让后续迁移幂等
   - 方案 B：所有 `ALTER TABLE ADD COLUMN` 改用 `add_column_if_missing`
   - 增加 CI 测试：创建空 SQLite → 跑完所有迁移 → 验证表结构

2. **修复 Dockerfile**
   - 如果服务端是 `server-standalone`，改为从该目录构建
   - 或者确认使用 `Dockerfile.prebuilt`

3. **修正 SS12 时间常量**
   - 统一以数据库 `seasons.started_at` 为主，常量作兜底
   - 修复测试断言

### 第二阶段：修复 P1（安全/稳定性）

4. **移除硬编码密码**
   - 保留 `server_config.example.yaml`
   - 真实密码通过环境变量注入

5. **修复 WAL 备份**
   - 备份前执行 `PRAGMA wal_checkpoint(TRUNCATE)`
   - 恢复时先关闭所有连接

6. **收紧 Tauri 权限**
   - 只开放应用数据目录
   - 移除不必要的 shell/process 权限

### 第三阶段：持续优化

7. **改进开发体验**
   - 开启 TypeScript `strict: true`
   - 清理 `console.log` 调试输出
   - 增加前后端集成测试

8. **优化性能**
   - 启动时显示缓存，后台刷新数据
   - `item_realtime_prices` 增加数据清理策略
   - 搜索功能后期改用 FTS5

9. **完善 CI/CD**
   - 添加迁移 smoke test
   - 添加代码覆盖率报告
   - 统一构建流程文档

---

## 十二、总结

### 综合评分

| 维度 | 得分 | 说明 |
|---|---|---|
| 技术栈选型 | 4.2/5 | 现代化栈，但有优化空间 |
| 架构设计 | 4.0/5 | 分层清晰，但有重复代码 |
| 代码质量 | 4.0/5 | 前端 7.5，后端 8.5 |
| 功能完整性 | 4.0/5 | 核心功能完成，部分缺失 |
| 安全 | 3.5/5 | 有硬编码密码、TLS 关闭等问题 |
| 可维护性 | 3.5/5 | 迁移体系不稳定 |

**项目综合评分：3.9 / 5**

### 结论

项目技术选型合理，架构设计良好，核心功能基本完成。当前最大问题是**数据库迁移体系不稳定**，会影响新用户安装。修复 P0 和部分 P1 问题后，适合小范围发布。

不建议立即发布给用户，应先修复 P0 阻塞问题（迁移、时间常量、Dockerfile）和 P1 安全问题（密码、TLS）。

---

*报告生成于 2026-05-13*