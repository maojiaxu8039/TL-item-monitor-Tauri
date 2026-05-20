import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, ChevronDown, ChevronUp, Key, Plus, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { serverAdmin, type ServerApiConfig } from "@/lib/commands";

interface ServerAdminPanelProps {
  serverUrl: string;
  connectionStatus: "connected" | "disconnected" | "error";
  serverStatus: { season_id: string } | null;
}

export default function ServerAdminPanel({ serverUrl, connectionStatus, serverStatus }: ServerAdminPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<"init-season" | "api-config">("api-config");
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);
  
  // Init Season
  const [newSeasonId, setNewSeasonId] = useState("");
  const [newSeasonStartedAt, setNewSeasonStartedAt] = useState("");
  
  // API Config
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [editedConfig, setEditedConfig] = useState<ServerApiConfig | null>(null);

  const getSignal = useCallback(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller.signal;
  }, []);

  const loadApiConfig = useCallback(async () => {
    if (!password) {
      toast.error("请先输入管理员密码");
      return;
    }
    setIsLoading(true);
    try {
      const config = await serverAdmin.getApiConfig(serverUrl, password, getSignal());
      setEditedConfig(config.api_config);
      setIsConfigLoaded(true);
      toast.success("API配置已加载");
    } catch (err) {
      toast.error(`加载配置失败: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [password, serverUrl, getSignal]);

  const handleInitSeason = useCallback(async () => {
    if (!password) {
      toast.error("请先输入管理员密码");
      return;
    }
    if (!newSeasonId) {
      toast.error("请输入赛季ID");
      return;
    }
    
    if (!newSeasonStartedAt) {
      toast.error("请选择开服日期");
      return;
    }
    
    const startedAt = Math.floor(new Date(newSeasonStartedAt).getTime() / 1000);
    if (Number.isNaN(startedAt) || startedAt <= 0) {
      toast.error("开服日期格式不正确");
      return;
    }
    
    setIsLoading(true);
    try {
      await serverAdmin.initSeason(serverUrl, password, newSeasonId, startedAt, undefined, getSignal());
      toast.success(`新赛季 ${newSeasonId} 初始化成功`);
      setNewSeasonId("");
      setNewSeasonStartedAt("");
    } catch (err) {
      toast.error(`初始化失败: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [password, newSeasonId, newSeasonStartedAt, serverUrl, getSignal]);

  const handleSaveApiConfig = useCallback(async () => {
    if (!password) {
      toast.error("请先输入管理员密码");
      return;
    }
    if (!editedConfig) {
      toast.error("配置未加载");
      return;
    }
    
    setIsLoading(true);
    try {
      await serverAdmin.updateApiConfig(serverUrl, password, editedConfig, getSignal());
      toast.success("API配置已更新（重启服务器后生效）");
    } catch (err) {
      toast.error(`保存失败: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [password, editedConfig, serverUrl, getSignal]);

  if (connectionStatus === "disconnected") {
    return (
      <div className="bg-[var(--color-panel)] rounded-xl border border-[var(--color-border-soft)] shadow-[var(--shadow-sm)] p-5">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[var(--color-text-subtle)]" />
          <span className="text-sm font-semibold text-[var(--color-text-subtle)]">服务器管理</span>
        </div>
        <p className="text-xs text-[var(--color-text-subtle)] mt-2">
          请先连接到服务器后再进行管理操作
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-panel)] rounded-xl border border-[var(--color-border-soft)] shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-5 py-4 hover:bg-[var(--color-panel-soft)] transition-colors"
      >
        <Settings className="w-4 h-4 text-[var(--color-brand-gold)]" />
        <span className="text-sm font-semibold text-[var(--color-text)]">服务器管理（管理员）</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-[var(--color-text-subtle)] ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--color-text-subtle)] ml-auto" />
        )}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-5 pb-5 space-y-4">
          {/* Password Input */}
          <div className="flex items-center gap-3">
            <Key className="w-4 h-4 text-[var(--color-text-subtle)]" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入管理员密码"
              className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            <button
              onClick={() => setIsConfigLoaded(false)}
              className="px-3 py-2 text-xs border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-panel-soft)]"
            >
              重置
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border-soft)]">
            <button
              onClick={() => setActiveTab("api-config")}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                activeTab === "api-config"
                  ? "border-[var(--color-brand-gold)] text-[var(--color-brand-gold)]"
                  : "border-transparent text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
              }`}
            >
              API配置
            </button>
            <button
              onClick={() => setActiveTab("init-season")}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                activeTab === "init-season"
                  ? "border-[var(--color-brand-gold)] text-[var(--color-brand-gold)]"
                  : "border-transparent text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
              }`}
            >
              初始化新赛季
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "api-config" && (
            <div className="space-y-4">
              {/* Load Config Button */}
              {!isConfigLoaded && (
                <button
                  onClick={loadApiConfig}
                  disabled={isLoading || !password}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--color-warning)] text-black text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                  加载当前配置
                </button>
              )}

              {/* Config Form */}
              {isConfigLoaded && editedConfig && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[var(--color-text-subtle)] mb-1">千岛TagID (普通服)</label>
                      <input
                        type="text"
                        value={editedConfig.qiandao_tag_id_normal}
                        onChange={(e) => setEditedConfig({ ...editedConfig, qiandao_tag_id_normal: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--color-text-subtle)] mb-1">千岛SpecID (普通服)</label>
                      <input
                        type="text"
                        value={editedConfig.qiandao_spec_id_normal}
                        onChange={(e) => setEditedConfig({ ...editedConfig, qiandao_spec_id_normal: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--color-text-subtle)] mb-1">千岛TagID (专家服)</label>
                      <input
                        type="text"
                        value={editedConfig.qiandao_tag_id_expert}
                        onChange={(e) => setEditedConfig({ ...editedConfig, qiandao_tag_id_expert: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--color-text-subtle)] mb-1">千岛SpecID (专家服)</label>
                      <input
                        type="text"
                        value={editedConfig.qiandao_spec_id_expert}
                        onChange={(e) => setEditedConfig({ ...editedConfig, qiandao_spec_id_expert: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--color-text-subtle)] mb-1">赛季 ID (普通服)</label>
                      <input
                        type="number"
                        value={editedConfig.luosi_season_id_normal}
                        onChange={(e) => setEditedConfig({ ...editedConfig, luosi_season_id_normal: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--color-text-subtle)] mb-1">赛季 ID (专家服)</label>
                      <input
                        type="number"
                        value={editedConfig.luosi_season_id_expert}
                        onChange={(e) => setEditedConfig({ ...editedConfig, luosi_season_id_expert: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveApiConfig}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-[var(--color-success)] text-black text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      保存配置
                    </button>
                    <span className="text-xs text-[var(--color-text-subtle)]">修改后需重启服务器生效</span>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "init-season" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--color-text-subtle)] mb-1">当前赛季</label>
                <div className="px-3 py-2 bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-lg text-sm">
                  {serverStatus?.season_id || "未知"}
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-[var(--color-text-subtle)] mb-1">新赛季ID</label>
                <input
                  type="text"
                  value={newSeasonId}
                  onChange={(e) => setNewSeasonId(e.target.value)}
                  placeholder="例如: ss13"
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                />
                <p className="text-xs text-[var(--color-text-subtle)] mt-1">新赛季ID格式：ss13, ss14 等</p>
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-subtle)] mb-1">开服日期 *</label>
                <input
                  type="datetime-local"
                  value={newSeasonStartedAt}
                  onChange={(e) => setNewSeasonStartedAt(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-sm"
                />
                <p className="text-xs text-[var(--color-text-subtle)] mt-1">必填，用于计算赛季天数</p>
              </div>

              <div className="p-3 bg-[rgba(255,184,0,0.08)] border border-[rgba(255,184,0,0.25)] rounded-lg">
                <p className="text-xs text-[var(--color-brand-gold)]">
                  初始化新赛季会创建新的数据库表，请确保先归档当前赛季数据。
                  此操作需要服务器重启后才能生效。
                </p>
              </div>

              <button
                onClick={handleInitSeason}
                disabled={isLoading || !password || !newSeasonId || !newSeasonStartedAt}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-warning)] text-black text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                初始化新赛季
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}