import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { cmd } from "@/lib/commands";
import {
  Brain,
  Send,
  Loader2,
  User,
  Bot,
  Settings,
  ChevronDown,
  Server,
  Globe,
  Cpu,
  CheckCircle2,
  XCircle,
  Key,
  Link,
  Save,
  Sparkles,
} from "lucide-react";
import { ToastContainer, useToast } from "@/components/ui/Toast";

// ─── Types ─────────────────────────────────────────────────────────────────

interface AIProviderConfig {
  provider: "hermes" | "openclaw" | "custom";
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
}

interface AISettings {
  providers: AIProviderConfig[];
  defaultProvider: string;
  systemPrompt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ─── Default Configs ────────────────────────────────────────────────────────

const DEFAULT_PROVIDERS: AIProviderConfig[] = [
  {
    provider: "hermes",
    name: "HERMES (本地)",
    apiUrl: "http://localhost:11434/v1/chat/completions",
    apiKey: "",
    model: "llama3",
    enabled: false,
  },
  {
    provider: "openclaw",
    name: "OPENClAW",
    apiUrl: "https://api.openclaw.ai/v1/chat/completions",
    apiKey: "",
    model: "gpt-4",
    enabled: false,
  },
  {
    provider: "custom",
    name: "自定义 API",
    apiUrl: "",
    apiKey: "",
    model: "",
    enabled: false,
  },
];

const DEFAULT_SETTINGS: AISettings = {
  providers: DEFAULT_PROVIDERS,
  defaultProvider: "hermes",
  systemPrompt: `你是TL（火炬之光）游戏的经济分析专家。请基于提供的火价和物品数据，给出专业的交易建议。

分析维度：
1. 火价走势判断（高/中/低）
2. 物品价格合理性评估
3. 买入/卖出时机建议
4. 风险提示

回答要求：
- 简洁专业，使用中文
- 给出具体的价格参考
- 说明判断依据`,
};

// ─── Settings Modal ────────────────────────────────────────────────────────

function SettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: AISettings;
  onSave: (settings: AISettings) => void;
  onClose: () => void;
}) {
  const [localSettings, setLocalSettings] = useState<AISettings>(settings);
  const [testStatus, setTestStatus] = useState<Record<string, "idle" | "testing" | "success" | "error">>({});

  const handleTest = async (provider: string) => {
    setTestStatus((prev) => ({ ...prev, [provider]: "testing" }));
    const config = localSettings.providers.find((p) => p.provider === provider);
    if (!config) return;

    try {
      const response = await fetch(config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 10,
        }),
      });

      if (response.ok) {
        setTestStatus((prev) => ({ ...prev, [provider]: "success" }));
      } else {
        setTestStatus((prev) => ({ ...prev, [provider]: "error" }));
      }
    } catch {
      setTestStatus((prev) => ({ ...prev, [provider]: "error" }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-800">AI配置</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Providers */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-3">AI提供商</h4>
            <div className="space-y-3">
              {localSettings.providers.map((provider) => (
                <div
                  key={provider.provider}
                  className={`border rounded-lg p-3 ${
                    provider.enabled ? "border-blue-200 bg-blue-50/30" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {provider.provider === "hermes" ? (
                        <Server className="w-4 h-4 text-green-600" />
                      ) : provider.provider === "openclaw" ? (
                        <Globe className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Cpu className="w-4 h-4 text-purple-600" />
                      )}
                      <span className="text-sm font-medium text-slate-700">{provider.name}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={provider.enabled}
                        onChange={(e) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            providers: prev.providers.map((p) =>
                              p.provider === provider.provider ? { ...p, enabled: e.target.checked } : p
                            ),
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                  </div>

                  {provider.enabled && (
                    <div className="space-y-2 mt-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">API地址</label>
                          <input
                            type="text"
                            value={provider.apiUrl}
                            onChange={(e) =>
                              setLocalSettings((prev) => ({
                                ...prev,
                                providers: prev.providers.map((p) =>
                                  p.provider === provider.provider ? { ...p, apiUrl: e.target.value } : p
                                ),
                              }))
                            }
                            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">模型</label>
                          <input
                            type="text"
                            value={provider.model}
                            onChange={(e) =>
                              setLocalSettings((prev) => ({
                                ...prev,
                                providers: prev.providers.map((p) =>
                                  p.provider === provider.provider ? { ...p, model: e.target.value } : p
                                ),
                              }))
                            }
                            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={provider.apiKey}
                          onChange={(e) =>
                            setLocalSettings((prev) => ({
                              ...prev,
                              providers: prev.providers.map((p) =>
                                p.provider === provider.provider ? { ...p, apiKey: e.target.value } : p
                              ),
                            }))
                          }
                          placeholder="API Key"
                          className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
                        />
                        <button
                          onClick={() => handleTest(provider.provider)}
                          disabled={testStatus[provider.provider] === "testing"}
                          className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          {testStatus[provider.provider] === "testing" ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : testStatus[provider.provider] === "success" ? (
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                          ) : testStatus[provider.provider] === "error" ? (
                            <XCircle className="w-3 h-3 text-red-500" />
                          ) : (
                            "测试"
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">系统提示词</h4>
            <textarea
              value={localSettings.systemPrompt}
              onChange={(e) =>
                setLocalSettings((prev) => ({ ...prev, systemPrompt: e.target.value }))
              }
              rows={6}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              onSave(localSettings);
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Save className="w-4 h-4" />
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AIAnalysisPage() {
  const { toasts, addToast, dismissToast } = useToast();
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { marketContext } = useSectionRefresh();

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {
      // ignore parse error
    }
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Get fire price data for context
  const { data: fireData } = useQuery({
    queryKey: ["fire-history", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getFireHistory(24),
  });

  const activeProvider = settings.providers.find((p) => p.enabled);

  const handleSend = async () => {
    if (!input.trim() || !activeProvider) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Build context with fire price data
      const contextData = fireData
        ? `当前赛季: ${marketContext.seasonId}, 当前火价: ${fireData[fireData.length - 1]?.rmb_per_10k_fire.toFixed(2)} 元/万火`
        : "";

      const response = await fetch(activeProvider.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeProvider.apiKey}`,
        },
        body: JSON.stringify({
          model: activeProvider.model,
          messages: [
            { role: "system", content: settings.systemPrompt + "\n" + contextData },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: input },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("API调用失败");
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "无响应";

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      addToast("error", "AI调用失败，请检查配置");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "抱歉，调用AI失败。请检查：\n1. AI提供商是否已启用\n2. API地址和密钥是否正确\n3. 网络连接是否正常",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (newSettings: AISettings) => {
    try {
      localStorage.setItem("ai_settings", JSON.stringify(newSettings));
      setSettings(newSettings);
      addToast("success", "AI配置已保存");
    } catch {
      addToast("error", "保存失败");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <h1 className="text-lg font-semibold text-slate-900">AI分析</h1>
          {activeProvider && (
            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full">
              {activeProvider.name}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings className="w-4 h-4" />
          配置
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Sparkles className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-sm font-medium">AI 经济分析助手</div>
              <div className="text-xs mt-1">输入问题获取专业的交易建议</div>
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                {[
                  "分析当前火价走势",
                  "推荐值得入手的物品",
                  "什么时候出售物品最好",
                  "分析新赛季囤货策略",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div
                key={index}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === "user"
                      ? "bg-blue-100 text-blue-600"
                      : "bg-purple-100 text-purple-600"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div
                    className={`text-xs mt-1 ${
                      msg.role === "user" ? "text-blue-200" : "text-slate-400"
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-100 rounded-xl px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-slate-100 p-4">
          {!activeProvider ? (
            <div className="text-center py-2 text-sm text-slate-400">
              请先配置并启用AI提供商
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题，例如：分析当前火价走势..."
                className="flex-1 text-sm border border-slate-200 rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-400"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-2.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
