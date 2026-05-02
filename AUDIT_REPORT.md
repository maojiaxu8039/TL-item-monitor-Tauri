# TL 物品火价监控 — 全面审计报告

**审计日期**: 2026-05-03
**审计范围**: 完整项目代码库（前端 + 后端 + 配置）
**审计版本**: v1.0.0

---

## 目录

1. [功能审计报告](#一功能审计报告)
2. [代码审计报告](#二代码审计报告)
3. [安全问题汇总](#三安全问题汇总)
4. [性能问题汇总](#四性能问题汇总)
5. [改进建议](#五改进建议)

---

## 一、功能审计报告

### 1.1 功能完整性评估

| 模块 | 功能点 | 状态 | 完成度 | 说明 |
|------|--------|------|--------|------|
| **监控首页** | 分组管理（增删改查） | ✅ | 100% | 完整实现 |
| | 拖拽排序 | ✅ | 100% | 使用 @dnd-kit 实现 |
| | 物品监控（价格/溢价率） | ✅ | 100% | 实时显示 |
| | CSV 导入/导出 | ✅ | 95% | 功能完整，有权限问题已修复 |
| | 添加物品到分组 | ✅ | 100% | 支持搜索添加 |
| **火价分析** | 当前火价显示 | ✅ | 100% | 实时显示 |
| | 火价走势图表 | ✅ | 100% | 双折线图对比 |
| | 最佳交易时段分析 | ✅ | 90% | 基于历史数据计算 |
| | 赛季对比（SS11 vs SS12） | ✅ | 100% | 时间轴对齐对比 |
| | 火价趋势判断 | ✅ | 100% | 高/正常/低自动判断 |
| **物价数据** | 物品搜索 | ✅ | 100% | 支持关键词搜索 |
| | 类型筛选（动态） | ✅ | 100% | 从数据库获取类型 |
| | 赛季筛选 | ✅ | 100% | 支持多赛季对比 |
| | 天数筛选 | ✅ | 100% | 开服第N天筛选 |
| | 价格对比 | ✅ | 100% | 当前 vs 历史赛季 |
| | 价格变化指示 | ✅ | 100% | 涨跌百分比和差值 |
| | 价格走势查看 | ✅ | 100% | 双曲线走势图 |
| | 添加到分组 | ✅ | 100% | 直接添加 |
| **数据监控** | 服务器连接状态 | ✅ | 100% | HTTP API 检测 |
| | 采集状态监控 | ✅ | 100% | 实时状态显示 |
| | 数据同步（火价） | ✅ | 100% | 支持赛季全量同步 |
| | 数据同步（物品） | ✅ | 100% | 支持赛季全量同步 |
| **物价分析** | 价格波动分析 | ⚠️ | 60% | 使用 Mock 数据 |
| | 囤货/卖出建议 | ⚠️ | 60% | 基于随机数据生成 |
| | 最佳买入/卖出时间 | ⚠️ | 60% | 需要真实数据支撑 |
| | 预期收益计算 | ⚠️ | 60% | Mock 数据计算 |
| | 置信度评分 | ⚠️ | 60% | 随机生成 |
| **捡漏出货** | 捡漏监控配置 | ✅ | 80% | UI 完成，逻辑待接入 |
| | 出货监控配置 | ✅ | 80% | UI 完成，逻辑待接入 |
| | 实时价格监控 | ❌ | 0% | 未实现 |
| | 阈值触发提醒 | ❌ | 0% | 未实现 |
| **AI 分析** | AI 配置管理 | ✅ | 90% | 支持多提供商配置 |
| | 连接测试 | ✅ | 100% | 实时测试 API |
| | 对话界面 | ✅ | 100% | 完整的聊天 UI |
| | 系统提示词配置 | ✅ | 100% | 支持自定义 |
| | AI 价格分析 | ⚠️ | 50% | 界面完成，分析逻辑待完善 |
| **识图助手** | 图片识别 | ❌ | 0% | 仅占位页面 |
| | 价格评估 | ❌ | 0% | 未实现 |
| | 高价值物品库 | ❌ | 0% | 未实现 |
| **策略管理** | 策略配置 | ❌ | 0% | 页面已清空，待重新开发 |
| | 收益计算 | ❌ | 0% | 未实现 |
| | 策略推荐 | ❌ | 0% | 未实现 |

### 1.2 功能风险等级

```
🔴 高风险（功能缺失影响核心使用）
   ├── 识图助手 — 完全未实现
   ├── 策略管理 — 功能已清空
   └── 捡漏出货 — 仅有 UI，无实际监控逻辑

🟡 中风险（功能可用但数据不准确）
   ├── 物价分析 — 使用 Mock 数据，建议不可信
   └── AI 分析 — 分析逻辑待完善

🟢 低风险（功能完整， minor issues）
   ├── 监控首页 — CSV 导出曾有权限问题（已修复）
   ├── 火价分析 — 部分文案需调整
   └── 物价数据 — 性能可优化
```

### 1.3 用户体验问题

| 问题 | 影响 | 建议 |
|------|------|------|
| 物价分析页面使用 Mock 数据 | 用户可能根据错误建议做决策 | 添加明显提示"演示数据"，或接入真实数据 |
| 捡漏/出货页面无实际功能 | 用户配置阈值后无响应 | 添加"开发中"提示，或实现基础监控 |
| 识图助手页面为空白占位 | 用户困惑 | 添加"即将推出"提示 |
| 策略管理页面为空 | 菜单项无意义 | 隐藏菜单或添加占位提示 |

---

## 二、代码审计报告

### 2.1 项目结构审计

```
TL-item-monitor-Tauri/
├── src/                          # 前端代码
│   ├── components/
│   │   ├── dashboard/            # 页面组件（12个文件）
│   │   │   ├── SearchBar.tsx     # 搜索 + CSV 导入导出
│   │   │   ├── ItemsPage.tsx     # 物价数据
│   │   │   ├── FirePriceComparePage.tsx  # 火价分析
│   │   │   ├── PriceAnalysisPage.tsx     # 物价分析（Mock）
│   │   │   ├── DealsPage.tsx     # 捡漏出货
│   │   │   ├── AIAnalysisPage.tsx        # AI 配置
│   │   │   ├── DataMonitorPage.tsx       # 数据监控
│   │   │   ├── ImageAssistPage.tsx       # 识图助手（占位）
│   │   │   ├── StrategiesPage.tsx        # 策略管理（空）
│   │   │   ├── ItemPriceTrendModal.tsx   # 价格趋势弹窗
│   │   │   ├── ImportExportPage.tsx      # 导入导出页面
│   │   │   └── SettingsPage.tsx          # 设置页面
│   │   ├── layout/               # 布局组件
│   │   └── ui/                   # UI 基础组件
│   ├── hooks/                    # 自定义 Hooks
│   ├── lib/                      # 工具库
│   ├── types/                    # 类型定义
│   └── App.tsx                   # 主应用
├── src-tauri/src/                # Rust 后端
│   ├── main.rs                   # 入口
│   ├── lib.rs                    # 库导出
│   ├── app.rs                    # 应用初始化
│   ├── commands/                 # Tauri 命令（10个模块）
│   ├── core/                     # 核心逻辑
│   ├── db/                       # 数据库（模型 + 仓库）
│   ├── scheduler/                # 定时任务
│   ├── scraper/                  # 数据抓取
│   ├── services/                 # 服务层
│   ├── tray.rs                   # 系统托盘
│   └── server/                   # 服务器端代码
└── 配置文件...
```

**结构评价**: ⭐⭐⭐⭐☆ (4/5)
- 优点：模块划分清晰，前后端分离明确
- 缺点：部分组件过大（如 ItemsPage.tsx 超过 500 行），server 代码与桌面端耦合

### 2.2 前端代码审计

#### 2.2.1 TypeScript 类型安全

| 检查项 | 结果 | 说明 |
|--------|------|------|
| `any` 类型使用 | ⚠️ 发现 19 处 | 主要集中在图表数据处理和 API 响应 |
| 缺少类型定义 | ⚠️ 部分存在 | 如 `generateMockAnalysis(items: any[])` |
| 接口完整性 | ✅ 良好 | 主要数据结构有接口定义 |

**具体 `any` 类型位置**：

```
src/components/dashboard/AIAnalysisPage.tsx:316     cmd.getConfig().then((cfg: any)
src/components/dashboard/PriceAnalysisPage.tsx:276  function generateMockAnalysis(items: any[])
src/components/dashboard/ItemsPage.tsx:237          priceCompareData.find((c: any)
src/components/dashboard/FirePriceComparePage.tsx:51-219   多处 chart data any
src/components/dashboard/ItemPriceTrendModal.tsx:49-192    多处 data any
src/components/dashboard/GroupCard.tsx:19           dragHandleProps?: any
src/components/dashboard/DashboardStats.tsx:30      const allItems: any[]
```

**建议**: 为图表数据和 API 响应定义明确接口，消除 `any` 类型。

#### 2.2.2 React 最佳实践

| 检查项 | 结果 | 说明 |
|--------|------|------|
| useEffect 依赖完整性 | ⚠️ 部分问题 | 部分 useEffect 缺少清理函数 |
| 内存泄漏风险 | ⚠️ 存在 | setTimeout 未清理（见下） |
| 组件重渲染优化 | ⚠️ 可优化 | 部分大数据列表未使用 useMemo |
| Hook 使用规范 | ✅ 良好 | 遵循 Rules of Hooks |

**未清理的 setTimeout**：

```
src/components/dashboard/ItemsPage.tsx:158          const timer = setTimeout(...)
src/components/ui/Toast.tsx:65                      setTimeout(() => {...})
src/components/dashboard/GroupCard.tsx:98           setTimeout(() => inputRef...)
src/components/dashboard/AddItemModal.tsx:31        searchTimeoutRef.current = setTimeout(...)
src/components/dashboard/ImportExportPage.tsx:50    setTimeout(() => setImportResult(null), 5000)
src/components/dashboard/ImportExportPage.tsx:69    setTimeout(() => setLastAction(null), 5000)
src/components/dashboard/ImportExportPage.tsx:88    setTimeout(() => setLastAction(null), 5000)
src/components/dashboard/ImportExportPage.tsx:106   setTimeout(() => setLastAction(null), 5000)
src/components/dashboard/ImportExportPage.tsx:125   setTimeout(() => setLastAction(null), 5000)
```

**风险**: 组件卸载时未清除定时器，可能导致内存泄漏和状态更新警告。

#### 2.2.3 控制台输出

```
src/components/dashboard/SearchBar.tsx:31-37        console.log / console.error（调试日志）
src/components/dashboard/DataMonitorPage.tsx:151    console.error（错误日志）
src/components/dashboard/DataMonitorPage.tsx:185    console.error（错误日志）
src/components/ErrorBoundary.tsx:22                 console.error（错误边界）
```

**建议**: 生产环境移除调试日志，使用统一的日志系统。

### 2.3 Rust 后端代码审计

#### 2.3.1 错误处理模式

| 模式 | 使用次数 | 评价 |
|------|----------|------|
| `?` 操作符 | 主导 | ✅ 推荐使用 |
| `unwrap()` / `expect()` | 2 处 | ⚠️ 需要处理 |
| `unwrap_or()` / `unwrap_or_else()` | 少量 | ✅ 相对安全 |
| `match` 显式处理 | 部分 | ✅ 推荐 |

**危险 unwrap/expect 位置**：

```rust
// main.rs:128 — 窗口隐藏失败时 panic
window.hide().unwrap();

// main.rs:133 — Tauri 运行失败时 panic
.expect("error while running tauri application");
```

**评价**: 整体错误处理良好，仅在窗口事件和主循环中有不可恢复的 panic，符合桌面应用惯例。

#### 2.3.2 SQL 注入风险评估

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 参数化查询 | ✅ 全面使用 | `sqlx::query("...").bind(...)` |
| 字符串拼接 SQL | ❌ 未发现 | 无 SQL 注入风险 |
| 动态表名 | ⚠️ 需关注 | repo_split.rs 中动态表名处理 |

**结论**: SQL 注入风险低，所有查询均使用参数化绑定。

#### 2.3.3 并发安全性

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 数据库连接池 | ✅ 配置正确 | max_connections = 1（SQLite 限制） |
| 状态共享 | ✅ 使用 RwLock | `parking_lot::RwLock` 性能良好 |
| 死锁风险 | ⚠️ 潜在 | 多处嵌套锁访问需审查 |
| 广播通道 | ✅ 正确使用 | tokio::sync::broadcast |

#### 2.3.4 资源管理

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 数据库连接释放 | ✅ 良好 | sqlx 自动管理 |
| 文件句柄 | ✅ 良好 | 使用 RAII 模式 |
| 内存缓存 | ⚠️ 无上限 | items_cache 可能无限增长 |
| 定时任务清理 | ✅ 良好 | 使用 abort channel |

### 2.4 配置审计

#### 2.4.1 package.json

```json
{
  "dependencies": {
    "react": "^19.1.0",           // ✅ 最新版本
    "@tauri-apps/api": "^2.5.0",   // ✅ Tauri 2.0
    "recharts": "^2.15.3",         // ✅ 图表库
    "zustand": "^5.0.3",           // ✅ 状态管理
    "@tanstack/react-query": "^5.74.4"  // ✅ 数据获取
  }
}
```

**问题**: 
- 缺少 `eslint` 配置
- 缺少 `prettier` 配置
- 缺少测试框架（jest/vitest）

#### 2.4.2 Cargo.toml

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite"] }
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
```

**问题**:
- `base64 = "0.4"` 版本过旧（最新 0.22）
- 未启用 `clippy` 检查
- 缺少测试依赖

#### 2.4.3 tauri.conf.json

```json
{
  "security": {
    "csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; ..."
  }
}
```

**问题**:
- `unsafe-eval` 存在 XSS 风险（但 React/Vite 构建需要）
- 未配置 `dangerousDisableAssetCspModification`（开发需要）
- 缺少 `permissions` 配置（Tauri 2.0 新特性）

---

## 三、安全问题汇总

### 3.1 高危问题

| 问题 | 位置 | 风险 | 修复建议 |
|------|------|------|----------|
| 无 | — | — | — |

### 3.2 中危问题

| 问题 | 位置 | 风险 | 修复建议 |
|------|------|------|----------|
| `unsafe-eval` in CSP | tauri.conf.json | XSS 风险 | 生产环境移除，或使用 nonce |
| 调试日志泄露 | SearchBar.tsx | 可能泄露敏感数据 | 生产环境禁用 console.log |
| Mock 数据误导 | PriceAnalysisPage.tsx | 用户可能按错误建议操作 | 添加明显提示或接入真实数据 |

### 3.3 低危问题

| 问题 | 位置 | 风险 | 修复建议 |
|------|------|------|----------|
| `any` 类型滥用 | 19 处 | 类型不安全 | 逐步替换为具体类型 |
| 未清理定时器 | 9 处 | 内存泄漏 | 组件卸载时清除 |
| unwrap 使用 | main.rs:128 | 窗口隐藏失败 panic | 使用 `let _ = window.hide()` |

---

## 四、性能问题汇总

### 4.1 前端性能

| 问题 | 位置 | 影响 | 建议 |
|------|------|------|------|
| 大数据列表未虚拟化 | ItemsPage.tsx | 渲染卡顿（>1000 条） | 使用 react-window 虚拟化 |
| 图表数据未缓存 | FirePriceComparePage.tsx | 重复计算 | 使用 useMemo 缓存 chartData |
| 频繁 API 调用 | SearchBar.tsx | 搜索时多次请求 | 增加 debounce 延迟 |
| 内存泄漏（定时器） | 9 个文件 | 长期运行内存增长 | 清理 useEffect |

### 4.2 后端性能

| 问题 | 位置 | 影响 | 建议 |
|------|------|------|------|
| SQLite 单连接 | app.rs:99 | 并发性能受限 | 考虑 WAL 模式或连接池优化 |
| 全量数据加载 | repo_items.rs | 启动慢 | 延迟加载或分页 |
| 无缓存策略 | scraper.rs | 重复抓取 | 添加响应缓存 |
| 数据库无索引 | migrations | 查询慢 | 为常用查询字段添加索引 |

---

## 五、改进建议

### 5.1 立即修复（P0）

1. **清理未使用的定时器**
   ```tsx
   useEffect(() => {
     const timer = setTimeout(() => {...}, 1000);
     return () => clearTimeout(timer); // 添加清理
   }, []);
   ```

2. **移除或标记 Mock 数据**
   ```tsx
   // PriceAnalysisPage.tsx 添加提示
   <div className="bg-yellow-50 text-yellow-700 px-4 py-2 rounded-lg text-sm">
     ⚠️ 当前使用演示数据，分析结果仅供参考
   </div>
   ```

3. **修复 main.rs unwrap**
   ```rust
   // 替换
   window.hide().unwrap();
   // 为
   let _ = window.hide();
   ```

### 5.2 短期优化（P1）

1. **添加类型定义**
   ```typescript
   interface ChartDataPoint {
     time: string;
     currentPrice: number;
     historyPrice: number;
   }
   ```

2. **配置 ESLint + Prettier**
   ```json
   // .eslintrc.json
   {
     "extends": ["@tauri-apps/eslint-config"],
     "rules": {
       "@typescript-eslint/no-explicit-any": "warn"
     }
   }
   ```

3. **添加基础测试**
   ```typescript
   // 组件测试示例
   describe('SearchBar', () => {
     it('should export CSV correctly', async () => {
       // 测试导出功能
     });
   });
   ```

### 5.3 中期规划（P2）

1. **接入真实历史数据**
   - 实现历史数据聚合查询
   - 替换 PriceAnalysisPage 中的 Mock 数据
   - 实现真实的价格波动分析算法

2. **实现捡漏/出货监控**
   - WebSocket 实时价格推送
   - 阈值判断逻辑
   - 系统通知集成

3. **识图助手开发**
   - 集成 OCR 库（如 Tesseract）
   - 物品词条识别
   - 价格评估算法

### 5.4 长期规划（P3）

1. **数据库优化**
   - 分表分库（按赛季）
   - 读写分离
   - 数据归档策略

2. **AI 分析增强**
   - 训练价格预测模型
   - 接入更多 AI 提供商
   - 本地化模型部署

3. **测试覆盖**
   - 单元测试 > 80%
   - E2E 测试（Playwright）
   - 性能基准测试

---

## 审计总结

### 评分卡

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | B+ | 整体良好，有改进空间 |
| 功能完整性 | B | 核心功能完成，部分模块待开发 |
| 安全性 | A- | 无严重漏洞， minor issues |
| 性能 | B | 可满足当前需求，需优化 |
| 可维护性 | B+ | 结构清晰，缺少测试 |
| 文档 | B | 有开发文档，需补充 API 文档 |

### 关键指标

```
代码总行数:     ~15,000 行（前端 ~8,000 + 后端 ~7,000）
组件数量:       25+ 个 React 组件
Rust 模块:      15+ 个模块
测试覆盖率:     0% ⚠️
any 类型使用:   19 处 ⚠️
unwrap 使用:    2 处 ⚠️
内存泄漏风险:   9 处 ⚠️
```

### 最终建议

项目整体架构合理，核心功能已实现。建议优先处理：

1. **立即**: 清理定时器内存泄漏、标记 Mock 数据
2. **本周**: 添加 ESLint 配置、修复类型问题
3. **本月**: 实现捡漏/出货监控逻辑、接入真实分析数据
4. **本季度**: 完成识图助手、策略管理重构、添加测试覆盖

---

*报告生成时间: 2026-05-03*
*审计工具: 静态代码分析 + 人工审查*
