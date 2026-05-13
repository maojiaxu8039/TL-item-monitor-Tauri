import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { cmd } from "@/lib/commands";
import {
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
import { AssetIcon } from "@/components/brand/AssetIcon";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-[var(--color-panel)] rounded-xl shadow-xl w-full max-w-md mx-4 border border-[var(--color-border)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[var(--color-text-muted)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text)]">OpenClaw Gateway 配置</h3>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text)]">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
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
              className="w-full text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-panel-soft)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-brand)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
              使用 ws:// 协议，默认为 ws://localhost:18789
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
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
              className="w-full text-sm border border-[var(--color-border)] rounded-lg px-3 py-2 bg-[var(--color-panel-soft)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-brand)]"
            />
            <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
              OpenClaw Gateway认证令牌
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)] rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => {
              onSave(localSettings);
              onClose();
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-white rounded-lg hover:opacity-90 transition-opacity"
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
          <span className="page-header-icon page-header-icon-brand h-9 w-9">
            <AssetIcon name="ai-analysis" className="h-7 w-7" />
          </span>
          <h1 className="text-lg font-semibold text-[var(--color-text)]">AI分析</h1>
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-[var(--color-success)]/20 text-[var(--color-success)] rounded-full">
            <Server className="w-3 h-3" />
            OpenClaw
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer">
            <span className="text-xs">AI功能</span>
            <div
              className={`relative w-10 h-5 rounded-full transition-colors ${
                aiEnabled ? "bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-gold)]" : "bg-[var(--color-panel-soft)] border border-[var(--color-border)]"
              }`}
              onClick={() => setAiEnabled(!aiEnabled)}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-[var(--color-panel)] rounded-full shadow transition-transform ${
                  aiEnabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </div>
            <span className={`text-xs ${aiEnabled ? "text-[var(--color-brand-gold)]" : "text-[var(--color-text-subtle)]"}`}>
              {aiEnabled ? "开启" : "关闭"}
            </span>
          </label>

          <div className="w-px h-4 bg-[var(--color-border)]" />
          {connectionStatus === "connected" && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-[var(--color-success)]/20 text-[var(--color-success)] rounded-full">
              <Wifi className="w-3 h-3" />
              已连接
            </span>
          )}

          {connectionStatus === "connecting" && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-[var(--color-brand-gold)]/20 text-[var(--color-brand-gold)] rounded-full">
              <Loader2 className="w-3 h-3 animate-spin" />
              连接中
            </span>
          )}

          {connectionStatus === "disconnected" && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-[var(--color-danger)]/20 text-[var(--color-danger)] rounded-full">
              <WifiOff className="w-3 h-3" />
              未连接
            </span>
          )}

          {connectionStatus === "error" && (
            <button
              onClick={handleReconnect}
              className="flex items-center gap-1 text-xs px-2 py-0.5 bg-[var(--color-danger)]/20 text-[var(--color-danger)] rounded-full hover:bg-[var(--color-danger)]/30"
            >
              <XCircle className="w-3 h-3" />
              重试
            </button>
          )}

          <button
            onClick={handleReconnect}
            className="p-2 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
            title="重新连接"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-panel-soft)] transition-colors"
          >
            <Settings className="w-4 h-4" />
            配置
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[var(--color-panel)] rounded-xl border border-[var(--color-border)] overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-subtle)]">
              <Sparkles className="w-12 h-12 text-[var(--color-text-subtle)] mb-3" />
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
                    className="px-3 py-1.5 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-full text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-border)] transition-colors"
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
                      ? "bg-[var(--color-brand)]/20 text-[var(--color-brand)]"
                      : "bg-[var(--color-ai)]/20 text-[var(--color-ai)]"
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
                      ? "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-white"
                      : "bg-[var(--color-panel-soft)] text-[var(--color-text)]"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div
                    className={`text-xs mt-1 ${
                      msg.role === "user" ? "text-blue-200" : "text-[var(--color-text-subtle)]"
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
              <div className="w-8 h-8 rounded-full bg-[rgba(167,139,250,0.12)] text-[var(--color-ai)] flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-[var(--color-panel)] rounded-xl px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-subtle)]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-[var(--color-border-soft)] p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题..."
              className="flex-1 text-sm border border-[var(--color-border)] rounded-lg px-4 py-2.5 focus:outline-none focus:border-purple-400"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="px-4 py-2.5 bg-[var(--color-ai)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
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
