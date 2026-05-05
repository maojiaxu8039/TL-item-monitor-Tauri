# AI分析页面 Skill调用集成方案

## 目标
让AI分析页面能够通过HERMES Gateway调用已安装的skills，实现更强大的功能扩展。

## HERMES/OPENClAW 架构

### Gateway API
- **地址**: `ws://localhost:18789`
- **认证Token**: `clawx-888b6b1f5f407e4598fe7d63c82bc413`
- **协议**: WebSocket

### 核心消息类型

```typescript
// 客户端 → Gateway
interface GatewayMessage {
  type: string;      // 消息类型
  id?: string;       // 可选的消息ID
  payload: object;   // 负载数据
  timestamp: string; // ISO 8601时间戳
}

// 支持的消息类型
type ClientMessage =
  | { type: "chat"; payload: { text: string; context?: object; options?: ChatOptions } }
  | { type: "skill_invoke"; payload: { skill: string; args: string } }
  | { type: "status"; payload: {} }
  | { type: "heartbeat_trigger"; payload: { dry_run?: boolean } };

// Gateway → 客户端
type ServerMessage =
  | { type: "response"; id: string; payload: { text: string; tool_calls: ToolCall[]; tokens_used: number } }
  | { type: "tool_call"; payload: { tool: string; args: object; status: "executing" } }
  | { type: "tool_result"; payload: { tool: string; output: string; exit_code: number } }
  | { type: "error"; payload: { code: string; message: string } }
  | { type: "heartbeat_status"; payload: { result: string; actions_taken: number; tokens_used: number } };
```

## 已安装的Skills

### 系统Skills (`~/.openclaw/skills/`)
1. **brave-web-search** - Brave网页搜索
2. **docx** - Word文档处理
3. **find-skills** - 查找和安装新skills
4. **pdf** - PDF处理（读取、创建、合并、OCR等）
5. **pptx** - PowerPoint处理
6. **self-improving-agent** - 自改进代理
7. **tavily-search** - Tavily搜索
8. **xlsx** - Excel处理

### 工作区Skills (`~/.openclaw/workspace/skills/`)
1. **auto-updater** - 自动更新
2. **brand-dna** - 品牌DNA分析
3. **canvas** - 画布操作
4. **copywriting** - 文案撰写
5. **douyin-live** - 抖音直播
6. **eagle** - 图片管理
7. **editor** - 编辑器
8. **excel-xlsx** - Excel操作
9. **find-skills** - 查找skills
10. **free-ride** - 免费乘车
11. **humanizer** - 人性化
12. **ima-skills** - IMA技能
13. **pricing** - 定价策略
14. **rednote** - 小红书
15. **reflection** - 反思
16. **seo** - SEO优化
17. **summarize** - 总结
18. **superpowers** - 超级能力
19. **trading** - 交易策略
20. **word-docx** - Word文档
21. **xurl** - URL处理
22. **zhihu-hot-cn** - 知乎热点

## 实现方案

### 方案A: WebSocket直连Gateway（推荐）

**优点**:
- 实时性强，支持流式响应
- 能够获取tool_call和tool_result事件
- 支持skill直接调用

**缺点**:
- 需要处理WebSocket连接管理
- 需要处理认证和重连

**实现步骤**:

1. **创建HERMES Gateway连接管理器**
   ```typescript
   class HermesGateway {
     private ws: WebSocket | null = null;
     private token: string = "clawx-888b6b1f5f407e4598fe7d63c82bc413";
     private messageHandlers: Map<string, Function> = new Map();
     private pendingMessages: Map<string, { resolve: Function; reject: Function }> = new Map();

     connect(): Promise<void>;
     disconnect(): void;
     send(message: GatewayMessage): Promise<any>;
     invokeSkill(skillName: string, args: string): Promise<string>;
     chat(text: string, context?: object): Promise<ChatResponse>;
     onMessage(type: string, handler: Function): void;
   }
   ```

2. **创建Skill选择UI组件**
   - 显示可用skills列表（从配置读取）
   - 允许用户选择要启用的skills
   - 显示skill描述

3. **集成到AI分析页面**
   - 添加WebSocket连接状态显示
   - 添加skill选择面板
   - 修改消息发送逻辑，支持context包含已选skills

### 方案B: REST API + Skill代理（备选）

**优点**:
- 实现简单，兼容现有AI调用方式
- 可以添加skill调用缓存

**缺点**:
- 不支持实时tool_call事件
- 需要额外的skill调用endpoint

## 技术实现

### 1. 读取已安装Skills
从 `~/.openclaw/skills/` 和 `~/.openclaw/workspace/skills/` 目录读取SKILL.md文件，解析YAML frontmatter获取skill元信息。

```typescript
interface SkillInfo {
  name: string;
  description: string;
  path: string;
  source: 'system' | 'workspace';
}

// 解析SKILL.md
function parseSkillMarkdown(content: string): SkillInfo {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    const name = yaml.match(/name:\s*(.+)/)?.[1];
    const description = yaml.match(/description:\s*(.+)/)?.[1];
    return { name, description, path: '', source: 'system' };
  }
  return null;
}
```

### 2. 连接管理

```typescript
class HermesConnection {
  private socket: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(
    private url: string,
    private token: string
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(`${this.url}?token=${this.token}`);

      this.socket.onopen = () => {
        console.log('Connected to Hermes Gateway');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.socket.onclose = () => {
        this.handleDisconnect();
      };
    });
  }

  private handleMessage(message: ServerMessage) {
    // 处理不同类型的消息
    if (message.type === 'response') {
      const pending = this.pendingMessages.get(message.id);
      if (pending) {
        pending.resolve(message.payload);
        this.pendingMessages.delete(message.id);
      }
    }
  }

  private async handleDisconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      await this.sleep(1000 * this.reconnectAttempts);
      try {
        await this.connect();
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }
  }
}
```

### 3. Skill调用流程

```typescript
async function invokeSkill(skillName: string, args: string): Promise<string> {
  const messageId = `skill-${Date.now()}`;

  const response = await this.send({
    type: 'skill_invoke',
    id: messageId,
    payload: {
      skill: skillName,
      args: args
    },
    timestamp: new Date().toISOString()
  });

  return response.text;
}
```

## UI设计

### Skill选择面板
- 左侧：Skill分类（系统Skills / 工作区Skills）
- 中间：Skill列表（名称 + 描述）
- 右侧：Skill详情预览

### 消息展示增强
- 显示skill调用事件（tool_call）
- 显示skill执行结果（tool_result）
- 流式显示AI响应

## 文件清单

### 新增文件
1. `src/lib/hermes.ts` - Hermes Gateway连接管理器
2. `src/components/dashboard/SkillSelector.tsx` - Skill选择器组件
3. `src/hooks/useHermes.ts` - Hermes连接React Hook
4. `src/lib/skills.ts` - Skill解析和加载工具

### 修改文件
1. `src/components/dashboard/AIAnalysisPage.tsx` - 集成HERMES连接和Skill选择
2. `src/lib/commands.ts` - 添加Tauri命令（读取本地skills）
3. `src-tauri/src/commands/hermes.rs` - Rust后端读取skills命令

## 测试计划

1. **基础连接测试**
   - [ ] WebSocket连接成功
   - [ ] Token认证通过
   - [ ] 心跳检测正常

2. **Chat功能测试**
   - [ ] 发送消息获得响应
   - [ ] Context正确传递
   - [ ] 流式响应正常

3. **Skill调用测试**
   - [ ] 读取skills列表成功
   - [ ] 单个skill调用成功
   - [ ] Skill执行结果正确显示

4. **集成测试**
   - [ ] Skill选择和启用
   - [ ] Chat中使用skill上下文
   - [ ] 错误处理和重连机制
