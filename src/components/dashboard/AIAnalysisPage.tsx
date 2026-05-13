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
  Server,
  XCircle,
  Save,
  Sparkles,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { ToastContainer } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";

interface AISettings {
  gatewayUrl: string;
  gatewayToken: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

const DEFAULT_SETTINGS = {
  gatewayUrl: "ws://localhost:18789",
  gatewayToken: "clawx-888b6b1f5f407e4598fe7d63c82bc413",
};

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-800">OpenClaw Gateway 配置</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Gateway WebSocket 地址
            </label>
            <input
              type="text"
              value={localSettings.gatewayUrl}
              onChange={(e) =>
                setLocalSettings((prev) => ({
                  ...prev,
                  gatewayUrl: e.target.value,
                }))
              }
              placeholder="ws://localhost:18789"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            />
            <p className="mt-1 text-xs text-slate-500">
              使用 ws:// 协议，默认为 ws://localhost:18789
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Gateway Token
            </label>
            <input
              type="password"
              value={localSettings.gatewayToken}
              onChange={(e) =>
                setLocalSettings((prev) => ({
                  ...prev,
                  gatewayToken: e.target.value,
                }))
              }
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            />
            <p className="mt-1 text-xs text-slate-500">
              OpenClaw Gateway认证令牌
            </p>
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
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AIAnalysisPage() {
  const { toasts, addToast, dismissToast } = useToast();
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [aiEnabled, setAiEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem("ai_enabled");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const connectionTestIdRef = useRef(0);
  const { marketContext } = useSectionRefresh();

  useEffect(() => {
    localStorage.setItem("ai_enabled", JSON.stringify(aiEnabled));
  }, [aiEnabled]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai_settings_v9");
      if (saved) {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch {
      // ignore parse error
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    testConnection(settings);
  }, [settings.gatewayUrl, settings.gatewayToken]);

  const testConnection = async (settingsToTest: AISettings = settings) => {
    const testId = ++connectionTestIdRef.current;
    setConnectionStatus('connecting');

    try {
      const result = await cmd.openclawChat(
        settingsToTest.gatewayUrl,
        settingsToTest.gatewayToken,
        "ping",
        "Just testing connection"
      );

      if (testId !== connectionTestIdRef.current) return;

      if (result.success) {
        setConnectionStatus('connected');
        addToast("success", "OpenClaw Gateway已连接");
      } else {
        setConnectionStatus('error');
        addToast("error", `连接失败: ${result.message}`);
      }
    } catch (error) {
      if (testId !== connectionTestIdRef.current) return;

      setConnectionStatus('error');
      addToast("error", "无法连接到OpenClaw Gateway");
    }
  };

  const { data: fireData } = useQuery({
    queryKey: ["fire-history", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getFireHistory(24),
  });

  const handleSend = async () => {
    if (!input.trim()) return;
    if (!aiEnabled) {
      addToast("warning", "AI功能已关闭，请在右上角开启");
      return;
    }

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const contextData = fireData
        ? `当前赛季: ${marketContext.seasonId}, 当前火价: ${fireData[fireData.length - 1]?.rmb_per_10k_fire.toFixed(2)} 元/万火`
        : "当前无火价数据";

      const systemPrompt = `你是TorchScan（火炬之光）游戏的经济分析专家。请基于提供的火价和物品数据，给出专业的交易建议。回答要求简洁专业，使用中文。`;

      const result = await cmd.openclawChat(
        settings.gatewayUrl,
        settings.gatewayToken,
        input,
        `${systemPrompt}\n\n${contextData}`
      );

      if (result.success && result.response) {
        const assistantMessage: ChatMessage = {
          id: generateMessageId(),
          role: "assistant",
          content: result.response,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('[OpenClaw] Send error:', error);
      addToast("error", "AI调用失败，请检查配置");
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: "assistant",
          content: `抱歉，调用AI失败：${error}\n\n请检查：\n1. OpenClaw Gateway是否已启动\n2. 地址和Token是否正确\n3. 网络连接是否正常`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (newSettings: AISettings) => {
    try {
      localStorage.setItem("ai_settings_v9", JSON.stringify(newSettings));
      setSettings(newSettings);
      addToast("success", "配置已保存");
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

  const handleReconnect = () => {
    testConnection();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-purple-500" />
          <h1 className="text-lg font-semibold text-slate-900">AI分析</h1>
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full">
            <Server className="w-3 h-3" />
            OpenClaw
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <span className="text-xs">AI功能</span>
            <div
              className={`relative w-10 h-5 rounded-full transition-colors ${
                aiEnabled ? "bg-blue-500" : "bg-slate-300"
              }`}
              onClick={() => setAiEnabled(!aiEnabled)}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  aiEnabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </div>
            <span className={`text-xs ${aiEnabled ? "text-blue-600" : "text-slate-400"}`}>
              {aiEnabled ? "开启" : "关闭"}
            </span>
          </label>

          <div className="w-px h-4 bg-slate-200" />
          {connectionStatus === "connected" && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded-full">
              <Wifi className="w-3 h-3" />
              已连接
            </span>
          )}

          {connectionStatus === "connecting" && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-yellow-100 text-yellow-600 rounded-full">
              <Loader2 className="w-3 h-3 animate-spin" />
              连接中
            </span>
          )}

          {connectionStatus === "disconnected" && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">
              <WifiOff className="w-3 h-3" />
              未连接
            </span>
          )}

          {connectionStatus === "error" && (
            <button
              onClick={handleReconnect}
              className="flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full hover:bg-red-200"
            >
              <XCircle className="w-3 h-3" />
              重试
            </button>
          )}

          <button
            onClick={handleReconnect}
            className="p-2 text-slate-400 hover:text-slate-600"
            title="重新连接"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            配置
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <Sparkles className="w-12 h-12 text-slate-300 mb-3" />
              <div className="text-sm font-medium">AI 经济分析助手</div>
              <div className="text-xs mt-1">
                通过OpenClaw Gateway连接
              </div>
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
            messages.map((msg) => (
              <div
                key={msg.id}
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

        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题..."
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
        </div>
      </div>

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
