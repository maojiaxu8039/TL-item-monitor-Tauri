import { useState, useEffect } from "react";
import { cmd, type AppConfig, type OkResponse, type NotificationPermissionStatus, type JsonFileValidationResult, type SeasonInfo } from "@/lib/commands";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, Save, Settings, Bell, Database, Globe, AlertTriangle, Trash2, Volume2, Archive, Plus, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const INTERVAL_OPTIONS = [
  { label: "5 分钟", value: 300 },
  { label: "10 分钟", value: 600 },
  { label: "30 分钟", value: 1800 },
  { label: "60 分钟", value: 3600 },
];

const COOLDOWN_OPTIONS = [
  { label: "5 分钟", value: 300 },
  { label: "10 分钟", value: 600 },
  { label: "30 分钟", value: 1800 },
  { label: "60 分钟", value: 3600 },
  { label: "2 小时", value: 7200 },
];

const SOURCE_OPTIONS = [
  { label: "API接口", value: "api" },
  { label: "本地JSON", value: "local" },
];

const DEFAULT_JSON_PATH = "/Users/mc/Library/Application Support/com.tlmonitor.app/data/full_table.json";

export default function SettingsPage() {
  const [fireEnabled, setFireEnabled] = useState(true);
  const [fireInterval, setFireInterval] = useState(300);
  const [itemsEnabled, setItemsEnabled] = useState(false);
  const [itemsInterval, setItemsInterval] = useState(300);
  const [itemsSource, setItemsSource] = useState("api");
  const [jsonPath, setJsonPath] = useState(DEFAULT_JSON_PATH);
  const [jsonPathValidation, setJsonPathValidation] = useState<JsonFileValidationResult | null>(null);
  const [seasonId, setSeasonId] = useState("ss12");
  const [itemCount, setItemCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(true);
  const [priceAlertCooldown, setPriceAlertCooldown] = useState(600);
  const [systemNotifications, setSystemNotifications] = useState(true);
  const [voiceAlertEnabled, setVoiceAlertEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [confirmNewSeasonOpen, setConfirmNewSeasonOpen] = useState(false);
  const [newSeasonId, setNewSeasonId] = useState("");
  const [newSeasonName, setNewSeasonName] = useState("");
  const [showNewSeasonForm, setShowNewSeasonForm] = useState(false);

  // New season API config inputs
  const [newQdTgn, setNewQdTgn] = useState("");
  const [newQdSpn, setNewQdSpn] = useState("");
  const [newQdTge, setNewQdTge] = useState("");
  const [newQdSpe, setNewQdSpe] = useState("");
  const [newLsSn, setNewLsSn] = useState("");
  const [newLsSe, setNewLsSe] = useState("");

  const seasonsQuery = useQuery<SeasonInfo[]>({
    queryKey: ["seasons"],
    queryFn: () => cmd.listSeasons(),
  });

  const saveMutation = useMutation<OkResponse, Error, AppConfig>({
    mutationFn: (config) => cmd.saveConfig(config),
    onSuccess: () => {
      toast.success("设置已保存", { position: 'bottom-right' });
    },
    onError: (err) => {
      toast.error(`保存失败: ${err.message || err}`, { position: 'bottom-right' });
    },
  });

  const refreshMutation = useMutation<OkResponse, Error, void>({
    mutationFn: () => cmd.refreshItems(),
  });

  const clearMutation = useMutation<string, Error, void>({
    mutationFn: () => cmd.clearItemsDatabase(),
    onSuccess: () => {
      toast.success("物品数据库已清空");
      setItemCount(0);
    },
    onError: (err) => {
      toast.error(`清空失败: ${err}`);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => cmd.archiveSeason(seasonId),
    onSuccess: (result) => {
      toast.success(`赛季 ${result.season_id} 归档完成`, {
        description: `物品: ${result.items_archived}, 火价记录: ${result.fire_records_archived}`,
      });
      seasonsQuery.refetch();
    },
    onError: (err: Error) => {
      toast.error(`归档失败: ${err.message}`);
    },
  });

  const initNewSeasonMutation = useMutation({
    mutationFn: () => {
      const apiConfig = {
        qiandao_tag_id_normal: newQdTgn,
        qiandao_spec_id_normal: newQdSpn,
        qiandao_tag_id_expert: newQdTge,
        qiandao_spec_id_expert: newQdSpe,
        luosi_season_id_normal: parseInt(newLsSn || "0", 10),
        luosi_season_id_expert: parseInt(newLsSe || "0", 10),
      };
      return cmd.initNewSeason(newSeasonId, newSeasonName || undefined, apiConfig);
    },
    onSuccess: (result) => {
      toast.success(`新赛季 ${result.season_id} 初始化完成`);
      setSeasonId(result.season_id);
      setNewSeasonId("");
      setNewSeasonName("");
      setNewQdTgn("");
      setNewQdSpn("");
      setNewQdTge("");
      setNewQdSpe("");
      setNewLsSn("");
      setNewLsSe("");
      setShowNewSeasonForm(false);
      seasonsQuery.refetch();
    },
    onError: (err: Error) => {
      toast.error(`初始化失败: ${err.message}`);
    },
  });

  const testAlertMutation = useMutation<string, Error, void>({
    mutationFn: () => cmd.triggerPriceAlert(),
    onSuccess: (result) => {
      toast.success(result);
    },
    onError: (err) => {
      toast.error(`测试失败: ${err}`);
    },
  });

  const requestPermissionMutation = useMutation<boolean, Error, void>({
    mutationFn: () => cmd.requestNotificationPermission(),
    onSuccess: (granted) => {
      if (granted) {
        toast.success("通知权限已授权");
        setNotificationPermission({ granted: true, denied: false, prompt: false, unknown: false });
      } else {
        toast.error("通知权限被拒绝，请在系统设置中开启");
      }
    },
    onError: (err) => {
      toast.error(`请求权限失败: ${err}`);
    },
  });

  useEffect(() => {
    cmd.getConfig().then((cfg) => {
      setFireEnabled(cfg.scrape.fire_price_scrape_enabled);
      setFireInterval(cfg.scrape.fire_price_scrape_interval);
      setItemsEnabled(cfg.scrape.auto_reload);
      setItemsInterval(cfg.scrape.items_reload_interval);
      setItemsSource(cfg.scrape.items_source);
      setJsonPath(cfg.scrape.items_json_path || DEFAULT_JSON_PATH);
      setSeasonId(cfg.app.season_id);
      setPriceAlertEnabled(cfg.notification.price_alert_enabled);
      setPriceAlertCooldown(cfg.notification.price_alert_cooldown_seconds);
      setSystemNotifications(cfg.notification.system_notifications);
      setVoiceAlertEnabled(cfg.notification.voice_alert_enabled);
      setLoaded(true);
      if (cfg.scrape.items_source === 'local') {
        cmd.validateJsonFile(cfg.scrape.items_json_path || DEFAULT_JSON_PATH).then(setJsonPathValidation).catch(() => {});
      }
    }).catch(() => {});

    cmd.getDashboardSummary().then((summary) => {
      setItemCount(summary.item_count);
    }).catch(() => {});

    cmd.getNotificationPermissionStatus().then((status) => {
      setNotificationPermission(status);
    }).catch(() => {});
  }, []);

  const validateJsonPath = async (path: string) => {
    const result = await cmd.validateJsonFile(path);
    setJsonPathValidation(result);
    return result;
  };

  const handleItemsSourceChange = async (source: string) => {
    setItemsSource(source);
    if (source === 'local') {
      await validateJsonPath(jsonPath);
    } else {
      setJsonPathValidation(null);
    }
  };

  const handleJsonPathChange = async (path: string) => {
    setJsonPath(path);
    if (itemsSource === 'local') {
      await validateJsonPath(path);
    }
  };

  const handleSave = () => {
    const config: AppConfig = {
      schema_version: 1,
      scrape: {
        fire_price_mode: "season_normal",
        fire_price_scrape_enabled: fireEnabled,
        fire_price_scrape_interval: fireInterval,
        items_source: itemsSource,
        items_json_path: jsonPath,
        items_reload_interval: itemsInterval,
        auto_reload: itemsEnabled,
      },
      desktop: {
        auto_start: false,
        tray_on_close: true,
        mini_mode: false,
        free_layout: false,
      },
      notification: {
        system_notifications: systemNotifications,
        voice_alert_enabled: voiceAlertEnabled,
        voice_alert_path: "/Users/mc/.openclaw/workspace/TL-item-monitor-Tauri/src-tauri/resources/萝莉音.mp3",
        price_alert_enabled: priceAlertEnabled,
        price_alert_cooldown_seconds: priceAlertCooldown,
        quiet_start: null,
        quiet_end: null,
      },
      deal: {
        bargain_enabled: true,
        bargain_threshold_percent: 30,
        sell_enabled: true,
        sell_threshold_percent: 30,
      },
      data: {
        history_retention: "permanent",
        compress_history: false,
      },
      app: {
        season_id: seasonId,
        language: "zh-CN",
        auto_update: false,
      },
    };
    saveMutation.mutate(config);
  };

  const handleRefreshItems = () => {
    refreshMutation.mutate();
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto space-y-4"
    >
      {/* Page title */}
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-5 h-5 text-slate-600" />
        <h1 className="text-[15px] font-semibold text-slate-800">系统设置</h1>
      </div>

      {/* Season settings */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-purple-500" />
          <h2 className="text-sm font-semibold text-slate-700">赛季设置</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">当前赛季 ID</div>
              <div className="text-xs text-slate-400 mt-0.5">如 ss12、ss11 等</div>
            </div>
            <input
              type="text"
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              placeholder="ss12"
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-slate-50 w-40 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* Season list */}
          <div className="border-t border-slate-100 pt-4">
            <div className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              赛季列表
            </div>
            {seasonsQuery.isLoading ? (
              <div className="text-xs text-slate-400">加载中...</div>
            ) : seasonsQuery.data && seasonsQuery.data.length > 0 ? (
              <div className="space-y-2">
                {seasonsQuery.data.map((s) => (
                  <div
                    key={s.season_id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                      s.is_current
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-100 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${s.is_current ? 'bg-blue-500' : 'bg-slate-300'}`} />
                      <div>
                        <div className="text-sm font-medium text-slate-700">
                          {s.name}
                          {s.is_current && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">当前</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          物品: {s.item_count} · 火价记录: {s.fire_record_count}
                        </div>
                      </div>
                    </div>
                    {!s.is_current && (
                      <button
                        onClick={() => {
                          setSeasonId(s.season_id);
                          toast.success(`已切换到赛季 ${s.season_id}`);
                        }}
                        className="text-xs px-2 py-1 border border-slate-200 rounded text-slate-600 hover:bg-white transition-colors"
                      >
                        切换
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400">暂无赛季数据</div>
            )}
          </div>

          {/* Archive current season */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-700">归档当前赛季</div>
                <div className="text-xs text-slate-400 mt-0.5">将 {seasonId} 数据打包为历史赛季</div>
              </div>
              <button
                onClick={() => setConfirmArchiveOpen(true)}
                disabled={archiveMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-amber-200 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                <Archive className="w-3.5 h-3.5" />
                {archiveMutation.isPending ? "归档中..." : "归档赛季"}
              </button>
            </div>
          </div>

          {/* Initialize new season */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-slate-700">初始化新赛季</div>
              {!showNewSeasonForm && (
                <button
                  onClick={() => setShowNewSeasonForm(true)}
                  className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新建赛季
                </button>
              )}
            </div>

            {showNewSeasonForm && (
              <div className="space-y-4 bg-slate-50 rounded-lg p-4">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">赛季 ID *</label>
                    <input
                      type="text"
                      value={newSeasonId}
                      onChange={(e) => setNewSeasonId(e.target.value)}
                      placeholder="如 ss13"
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">赛季名称</label>
                    <input
                      type="text"
                      value={newSeasonName}
                      onChange={(e) => setNewSeasonName(e.target.value)}
                      placeholder="如 SS13 赛季"
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                {/* Qiandao API */}
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                    千岛火价 API 参数
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">普通服 tagId *</label>
                      <input
                        type="text"
                        value={newQdTgn}
                        onChange={(e) => setNewQdTgn(e.target.value)}
                        placeholder="如 1560053"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">普通服 specId *</label>
                      <input
                        type="text"
                        value={newQdSpn}
                        onChange={(e) => setNewQdSpn(e.target.value)}
                        placeholder="如 267416"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">专家服 tagId *</label>
                      <input
                        type="text"
                        value={newQdTge}
                        onChange={(e) => setNewQdTge(e.target.value)}
                        placeholder="如 1560055"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">专家服 specId *</label>
                      <input
                        type="text"
                        value={newQdSpe}
                        onChange={(e) => setNewQdSpe(e.target.value)}
                        placeholder="如 267417"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>
                </div>

                {/* Luosi API */}
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                    小助手 API 参数 (刷图助手)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">普通服 season_id *</label>
                      <input
                        type="number"
                        value={newLsSn}
                        onChange={(e) => setNewLsSn(e.target.value)}
                        placeholder="如 1401"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">专家服 season_id *</label>
                      <input
                        type="number"
                        value={newLsSe}
                        onChange={(e) => setNewLsSe(e.target.value)}
                        placeholder="如 1431"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setShowNewSeasonForm(false);
                      setNewSeasonId("");
                      setNewSeasonName("");
                      setNewQdTgn("");
                      setNewQdSpn("");
                      setNewQdTge("");
                      setNewQdSpe("");
                      setNewLsSn("");
                      setNewLsSe("");
                    }}
                    className="text-sm px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => setConfirmNewSeasonOpen(true)}
                    disabled={!newSeasonId || !newQdTgn || !newQdSpn || !newQdTge || !newQdSpe || !newLsSn || !newLsSe || initNewSeasonMutation.isPending}
                    className="flex items-center gap-1.5 text-sm px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {initNewSeasonMutation.isPending ? "初始化中..." : "确认初始化"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Price Alert settings */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-700">价格预警设置</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm font-medium text-slate-700">开启系统通知</div>
                <div className="text-xs text-slate-400 mt-0.5">开启后将在发现值得购买的物品时发送桌面通知</div>
              </div>
              {notificationPermission && (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${notificationPermission.granted ? 'bg-green-500' : notificationPermission.denied ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                  <span className="text-xs text-slate-500">
                    {notificationPermission.granted ? '已授权' : notificationPermission.denied ? '已拒绝' : '未授权'}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={systemNotifications}
                  onChange={(e) => setSystemNotifications(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
              {!notificationPermission?.granted && (
                <button
                  onClick={() => requestPermissionMutation.mutate()}
                  disabled={requestPermissionMutation.isPending}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {requestPermissionMutation.isPending ? '申请中...' : '申请权限'}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-sm font-medium text-slate-700">开启语音提醒</div>
                <div className="text-xs text-slate-400 mt-0.5">预警触发时播放语音提示</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={voiceAlertEnabled}
                onChange={(e) => setVoiceAlertEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">开启价格预警弹窗</div>
              <div className="text-xs text-slate-400 mt-0.5">当监控物品变得"值的"时弹出通知提醒</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={priceAlertEnabled}
                onChange={(e) => setPriceAlertEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          {priceAlertEnabled && (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-700">预警间隔时间</div>
                <div className="text-xs text-slate-400 mt-0.5">预警触发后的等待时间</div>
              </div>
              <select
                value={priceAlertCooldown}
                onChange={(e) => setPriceAlertCooldown(Number(e.target.value))}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                {COOLDOWN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-end pt-2">
            <button
              onClick={() => testAlertMutation.mutate()}
              disabled={testAlertMutation.isPending}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-amber-200 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {testAlertMutation.isPending ? "检测中..." : "测试价格预警"}
            </button>
          </div>
        </div>
      </section>

      {/* Fire price settings */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-700">火价设置</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">自动刷新火价</div>
              <div className="text-xs text-slate-400 mt-0.5">开启后自动定期获取最新火价</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={fireEnabled}
                onChange={(e) => setFireEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">刷新间隔</div>
            <select
              value={fireInterval}
              onChange={(e) => setFireInterval(Number(e.target.value))}
              disabled={!fireEnabled}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Items data settings */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-700">物品数据设置</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">自动刷新物品</div>
              <div className="text-xs text-slate-400 mt-0.5">开启后自动定期重新加载物品数据</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={itemsEnabled}
                onChange={(e) => setItemsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">刷新间隔</div>
            <select
              value={itemsInterval}
              onChange={(e) => setItemsInterval(Number(e.target.value))}
              disabled={!itemsEnabled}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">数据源</div>
            <select
              value={itemsSource}
              onChange={(e) => handleItemsSourceChange(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex items-center justify-between ${itemsSource === 'local' ? 'opacity-100' : 'opacity-50'}`}>
            <div className="text-sm font-medium text-slate-700">本地JSON路径</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={jsonPath}
                onChange={(e) => handleJsonPathChange(e.target.value)}
                readOnly={itemsSource !== 'local'}
                className={`text-xs border rounded-lg px-3 py-1.5 w-72 overflow-hidden text-ellipsis ${
                  itemsSource === 'local' 
                    ? 'border-slate-300 text-slate-700 bg-white focus:ring-2 focus:ring-blue-500/30' 
                    : 'border-slate-200 text-slate-400 bg-slate-50'
                }`}
              />
              {itemsSource === 'local' && jsonPathValidation && (
                <div className={`flex items-center gap-1 text-xs ${jsonPathValidation.valid ? 'text-green-600' : 'text-red-500'}`}>
                  {jsonPathValidation.valid ? (
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      <span className="max-w-[150px] truncate" title={jsonPathValidation.error_message || ''}>
                        {jsonPathValidation.error_message}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="text-sm text-slate-500">
              已加载 <span className="font-semibold text-slate-700">{itemCount}</span> 个物品
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmClearOpen(true)}
                disabled={clearMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="清空物品数据库，重新抓取"
              >
                <Trash2 className={`w-3.5 h-3.5 ${clearMutation.isPending ? "animate-spin" : ""}`} />
                {clearMutation.isPending ? "清空中…" : "清空数据库"}
              </button>
              <button
                onClick={handleRefreshItems}
                disabled={refreshMutation.isPending}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                {refreshMutation.isPending ? "刷新中…" : "刷新物品"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Version */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700">当前版本</div>
            <div className="text-xs text-slate-400 mt-0.5">v2.0.0 · Tauri 2.0</div>
          </div>
          <button
            onClick={() => window.open("https://github.com/your-repo/releases", "_blank")}
            className="text-sm px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            检查更新
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="清空数据库"
        message="确定要清空物品数据库吗？此操作不可恢复，清空后需要重新抓取数据。"
        confirmText="清空"
        cancelText="取消"
        variant="danger"
        onConfirm={() => {
          setConfirmClearOpen(false)
          clearMutation.mutate()
        }}
        loading={clearMutation.isPending}
      />

      <ConfirmDialog
        open={confirmArchiveOpen}
        onOpenChange={setConfirmArchiveOpen}
        title="归档赛季"
        message={`确定要将赛季 ${seasonId} 的数据归档吗？归档后会将数据打包到独立的归档文件中，并标记该赛季为已结束。`}
        confirmText="归档"
        cancelText="取消"
        variant="warning"
        onConfirm={() => {
          setConfirmArchiveOpen(false)
          archiveMutation.mutate()
        }}
        loading={archiveMutation.isPending}
      />

      <ConfirmDialog
        open={confirmNewSeasonOpen}
        onOpenChange={setConfirmNewSeasonOpen}
        title="初始化新赛季"
        message={`确定要初始化新赛季 ${newSeasonId} 吗？这会创建新的数据表用于记录新赛季的数据。`}
        confirmText="初始化"
        cancelText="取消"
        variant="info"
        onConfirm={() => {
          setConfirmNewSeasonOpen(false)
          initNewSeasonMutation.mutate()
        }}
        loading={initNewSeasonMutation.isPending}
      />

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? "保存中…" : "保存设置"}
        </button>
      </div>
    </motion.div>
  );
}