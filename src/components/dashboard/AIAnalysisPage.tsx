import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { cmd } from "@/lib/commands";
import {
  Brain,
  Send,
  Bot,
  User,
  Loader2,
  Settings,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AIConfig {
  provider: "local" | "openai" | "custom";
  apiKey: string;
  apiUrl: string;
  model: string;
}

export default function AIAnalysisPage() {
  const { marketContext } = useSectionRefresh();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: "local",
    apiKey: "",
    apiUrl: "",
    model: "gpt-3.5-turbo",
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 获取火价历史数据
  const { data: fireHistory = [] } = useQuery({
    queryKey: ["fire-history", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getFireHistory(168),
  });

  // 获取物品数据
  const { data: itemsData } = useQuery({
    queryKey: ["items-search", marketContext.seasonId, marketContext.marketMode, "", "all", "price_desc", 1],
    queryFn: () => cmd.searchItems("", 1, 50),
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 生成系统提示词
  const generateSystemPrompt = () => {
    const firePrices = fireHistory.map((h: any) => h.rmb_per_10k_fire);
    const avgFirePrice = firePrices.length > 0
      ? firePrices.reduce((a: number, b: number) => a + b, 0) / firePrices.length
      : 0;
    const currentFirePrice = firePrices[0] || 0;
    const fireTrend = currentFirePrice > avgFirePrice ? "上涨" : "下跌";

    const topItems = itemsData?.items?.slice(0, 10).map((item: any) => ({
      name: item.name,
      price: item.price,
      type: item.item_type,
    })) || [];

    return `你是TL（火炬之光）游戏的经济分析专家。请基于以下数据提供专业的物价分析建议：

当前赛季：${marketContext.seasonId}
服务器类型：${marketContext.marketMode === "season_expert" ? "专家服" : "普通服"}

火价数据：
- 当前火价：${currentFirePrice.toFixed(2)} 元/万火
- 历史均价：${avgFirePrice.toFixed(2)} 元/万火
- 趋势：${fireTrend}

热门物品：
${topItems.map((item: any) => `- ${item.name}: ${item.price.toFixed(2)} 火`).join("\n")}

请根据这些数据，分析当前市场状况，并给出合理的交易建议。
回答要简洁专业，使用中文。`;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      let response: string;

      if (aiConfig.provider === "local") {
        // 使用本地模拟分析
        response = generateLocalAnalysis(input);
      } else {
        // 调用外部AI API
        response = await callExternalAI(input);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "抱歉，分析过程中出现错误。请检查AI配置或稍后重试。",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 本地分析逻辑
  const generateLocalAnalysis = (query: string) => {
    const firePrices = fireHistory.map((h: any) => h.rmb_per_10k_fire);
    const avgFirePrice = firePrices.length > 0
      ? firePrices.reduce((a: number, b: number) => a + b, 0) / firePrices.length
      : 0;
    const currentFirePrice = firePrices[0] || 0;
    const fireTrendPercent = avgFirePrice > 0 ? ((currentFirePrice - avgFirePrice) / avgFirePrice * 100) : 0;

    // 根据查询内容生成不同的分析
    if (query.includes("火价") || query.includes("走势")) {
      return `## 火价分析

当前火价：¥${currentFirePrice.toFixed(2)}/万火
历史均价：¥${avgFirePrice.toFixed(2)}/万火
涨跌幅：${fireTrendPercent > 0 ? "+" : ""}${fireTrendPercent.toFixed(1)}%

**分析结论**：
${currentFirePrice > avgFirePrice * 1.1 
  ? "🔴 火价处于高位，建议出售物品换取RMB，等待火价回落后再购入。"
  : currentFirePrice < avgFirePrice * 0.9
  ? "🟢 火价处于低位，建议用RMB购入火，储备物品等待升值。"
  : "🟡 火价处于正常区间，可按需交易。"
}

**建议**：
- ${currentFirePrice > avgFirePrice ? "适合出售物品" : "适合购买物品"}
- 关注火价${currentFirePrice > avgFirePrice ? "回落" : "上涨"}时机`;
    }

    if (query.includes("物品") || query.includes("装备")) {
      const topItems = itemsData?.items?.slice(0, 5) || [];
      return `## 热门物品分析

当前热门物品价格：
${topItems.map((item: any, idx: number) => `${idx + 1}. ${item.name}: ${item.price.toFixed(2)} 火`).join("\n")}

**交易建议**：
- 火价${currentFirePrice > avgFirePrice ? "较高" : "较低"}时，${currentFirePrice > avgFirePrice ? "物品价格相对便宜，适合购入" : "物品价格相对较贵，建议观望"}
- 建议关注性价比高的装备，计算每火带来的属性提升`;
    }

    // 默认分析
    return `## 市场综合分析

基于当前数据分析：

1. **火价状况**：${currentFirePrice > avgFirePrice ? "偏高" : "偏低"}（¥${currentFirePrice.toFixed(2)} vs 均价 ¥${avgFirePrice.toFixed(2)}）

2. **交易策略**：
   ${currentFirePrice > avgFirePrice 
     ? "- 出售物品换取RMB\n- 等待火价回落后再购入"
     : "- 用RMB购买火\n- 购入需要的物品装备"
   }

3. **风险提示**：
   - 以上分析基于历史数据，仅供参考
   - 实际交易请结合当前市场情况
   - 注意控制风险，避免过度投资

您还可以询问：
- "火价走势如何？"
- "现在适合买什么物品？"
- "分析下热门装备"`;
  };

  // 调用外部AI
  const callExternalAI = async (query: string): Promise<string> => {
    const systemPrompt = generateSystemPrompt();
    
    const response = await fetch(aiConfig.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: query },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("AI API调用失败");
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "无法获取AI回复";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-4 h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <h1 className="text-lg font-semibold text-slate-900">AI分析</h1>
        </div>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          AI配置
        </button>
      </div>

      {/* AI Config Panel */}
      {showConfig && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-700">AI服务配置</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">服务提供商</label>
              <select
                value={aiConfig.provider}
                onChange={(e) => setAiConfig({ ...aiConfig, provider: e.target.value as any })}
                className="w-full text-sm border border-slate-200 rounded px-2 py-1.5"
              >
                <option value="local">本地分析（无需配置）</option>
                <option value="openai">OpenAI</option>
                <option value="custom">自定义API</option>
              </select>
            </div>
            {aiConfig.provider !== "local" && (
              <>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">API Key</label>
                  <input
                    type="password"
                    value={aiConfig.apiKey}
                    onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full text-sm border border-slate-200 rounded px-2 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">API地址</label>
                  <input
                    type="text"
                    value={aiConfig.apiUrl}
                    onChange={(e) => setAiConfig({ ...aiConfig, apiUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1/chat/completions"
                    className="w-full text-sm border border-slate-200 rounded px-2 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">模型</label>
                  <input
                    type="text"
                    value={aiConfig.model}
                    onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                    placeholder="gpt-3.5-turbo"
                    className="w-full text-sm border border-slate-200 rounded px-2 py-1.5"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Sparkles className="w-12 h-12 text-purple-200 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-slate-500 mb-1">AI经济分析师</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                基于当前赛季的火价和物品数据，为您提供专业的交易建议。
                <br />
                可以询问：火价走势、物品推荐、交易时机等
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {[
                  "分析当前火价走势",
                  "推荐值得入手的物品",
                  "什么时候出售物品最好",
                  "分析热门装备性价比",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-purple-600" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 ${
                  message.role === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-slate-50 border border-slate-100 text-slate-700"
                }`}
              >
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                <div
                  className={`text-[10px] mt-1 ${
                    message.role === "user" ? "text-blue-200" : "text-slate-400"
                  }`}
                >
                  {new Date(message.timestamp).toLocaleTimeString("zh-CN")}
                </div>
              </div>
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-purple-600" />
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  分析中...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入您的问题，例如：分析当前火价走势..."
              className="flex-1 text-sm border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
