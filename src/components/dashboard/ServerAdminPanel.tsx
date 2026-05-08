import { useState } from "react";
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
  
  // Init Season
  const [newSeasonId, setNewSeasonId] = useState("");
  const [newSeasonStartedAt, setNewSeasonStartedAt] = useState("");
  
  // API Config
  const [, setApiConfig] = useState<ServerApiConfig | null>(null);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [editedConfig, setEditedConfig] = useState<ServerApiConfig | null>(null);

  const loadApiConfig = async () => {
    if (!password) {
      toast.error("请先输入管理员密码");
      return;
    }
    setIsLoading(true);
    try {
      const config = await serverAdmin.getApiConfig(serverUrl, password);
      setApiConfig(config);
      setEditedConfig(config);
      setIsConfigLoaded(true);
      toast.success("API配置已加载");
    } catch (err) {
      toast.error(`加载配置失败: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitSeason = async () => {
    if (!password) {
      toast.error("请先输入管理员密码");
      return;
    }
    if (!newSeasonId) {
      toast.error("请输入赛季ID");
      return;
    }
    
    const startedAt = parseInt(newSeasonStartedAt, 10);
    if (isNaN(startedAt) || startedAt <= 0) {
      toast.error("请输入正确的开服时间戳（正整数Unix秒）");
      return;
    }
    
    setIsLoading(true);
    try {
      await serverAdmin.initSeason(serverUrl, password, newSeasonId, startedAt);
      toast.success(`新赛季 ${newSeasonId} 初始化成功`);
      setNewSeasonId("");
      setNewSeasonStartedAt("");
    } catch (err) {
      toast.error(`初始化失败: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveApiConfig = async () => {
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
      await serverAdmin.updateApiConfig(serverUrl, password, editedConfig);
      toast.success("API配置已更新（重启服务器后生效）");
      setApiConfig(editedConfig);
    } catch (err) {
      toast.error(`保存失败: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (connectionStatus === "disconnected") {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-300" />
          <span className="text-sm font-semibold text-slate-400">服务器管理</span>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          请先连接到服务器后再进行管理操作
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <Settings className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-semibold text-slate-700">服务器管理（管理员）</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400 ml-auto" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 ml-auto" />
        )}
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-5 pb-5 space-y-4">
          {/* Password Input */}
          <div className="flex items-center gap-3">
            <Key className="w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入管理员密码"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
            <button
              onClick={() => setIsConfigLoaded(false)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              重置
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => setActiveTab("api-config")}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                activeTab === "api-config"
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              API配置
            </button>
            <button
              onClick={() => setActiveTab("init-season")}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                activeTab === "init-season"
                  ? "border-amber-500 text-amber-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
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
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50"
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
                      <label className="block text-xs text-slate-500 mb-1">千岛TagID (普通服)</label>
                      <input
                        type="text"
                        value={editedConfig.qiandao_tag_id_normal}
                        onChange={(e) => setEditedConfig({ ...editedConfig, qiandao_tag_id_normal: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">千岛SpecID (普通服)</label>
                      <input
                        type="text"
                        value={editedConfig.qiandao_spec_id_normal}
                        onChange={(e) => setEditedConfig({ ...editedConfig, qiandao_spec_id_normal: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">千岛TagID (专家服)</label>
                      <input
                        type="text"
                        value={editedConfig.qiandao_tag_id_expert}
                        onChange={(e) => setEditedConfig({ ...editedConfig, qiandao_tag_id_expert: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">千岛SpecID (专家服)</label>
                      <input
                        type="text"
                        value={editedConfig.qiandao_spec_id_expert}
                        onChange={(e) => setEditedConfig({ ...editedConfig, qiandao_spec_id_expert: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">赛季 ID (普通服)</label>
                      <input
                        type="number"
                        value={editedConfig.luosi_season_id_normal}
                        onChange={(e) => setEditedConfig({ ...editedConfig, luosi_season_id_normal: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">赛季 ID (专家服)</label>
                      <input
                        type="number"
                        value={editedConfig.luosi_season_id_expert}
                        onChange={(e) => setEditedConfig({ ...editedConfig, luosi_season_id_expert: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveApiConfig}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      保存配置
                    </button>
                    <span className="text-xs text-slate-400">修改后需重启服务器生效</span>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "init-season" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">当前赛季</label>
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
                  {serverStatus?.season_id || "未知"}
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-slate-500 mb-1">新赛季ID</label>
                <input
                  type="text"
                  value={newSeasonId}
                  onChange={(e) => setNewSeasonId(e.target.value)}
                  placeholder="例如: ss13"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">新赛季ID格式：ss13, ss14 等</p>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">开服时间戳 (Unix秒)</label>
                <input
                  type="number"
                  value={newSeasonStartedAt}
                  onChange={(e) => setNewSeasonStartedAt(e.target.value)}
                  placeholder="例如: 1735689600"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">必填：用于计算赛季天数</p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700">
                  初始化新赛季会创建新的数据库表，请确保先归档当前赛季数据。
                  此操作需要服务器重启后才能生效。
                </p>
              </div>

              <button
                onClick={handleInitSeason}
                disabled={isLoading || !password || !newSeasonId || !newSeasonStartedAt}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50"
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