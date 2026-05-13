import { useState, useEffect } from "react";
import { cmd, type AppConfig, type OkResponse, type NotificationPermissionStatus, type JsonFileValidationResult, type SeasonInfo } from "@/lib/commands";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, Save, Settings, Bell, Database, Globe, AlertTriangle, Trash2, Archive, Plus, Edit3, Key } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Toolbar, ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";

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

const DEFAULT_JSON_FILENAME = "full_table.json";

function getDefaultJsonPath(appDataDir: string): string {
  return `${appDataDir}/${DEFAULT_JSON_FILENAME}`;
}

export default function SettingsPage() {
  const [fireEnabled, setFireEnabled] = useState(true);
  const [fireInterval, setFireInterval] = useState(300);
  const [itemsEnabled, setItemsEnabled] = useState(false);
  const [itemsInterval, setItemsInterval] = useState(300);
  const [itemsSource, setItemsSource] = useState("api");
  const [expertEnabled, setExpertEnabled] = useState(false);
  const [jsonPath, setJsonPath] = useState("");
  const [jsonPathValidation, setJsonPathValidation] = useState<JsonFileValidationResult | null>(null);
  const [seasonId, setSeasonId] = useState("ss12");
  const [itemCount, setItemCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(true);
  const [priceAlertCooldown, setPriceAlertCooldown] = useState(600);
  const [systemNotifications, setSystemNotifications] = useState(true);
  const [voiceAlertEnabled, setVoiceAlertEnabled] = useState(false);
  const [voiceAlertPath, setVoiceAlertPath] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [confirmNewSeasonOpen, setConfirmNewSeasonOpen] = useState(false);
  const [newSeasonId, setNewSeasonId] = useState("");
  const [newSeasonName, setNewSeasonName] = useState("");
  const [newSeasonStartedAt, setNewSeasonStartedAt] = useState("");
  const [showNewSeasonForm, setShowNewSeasonForm] = useState(false);

  // API config editing state
  const [editingApiSeason, setEditingApiSeason] = useState<string | null>(null);
  const [apiConfigForm, setApiConfigForm] = useState({
    qiandao_tag_id_normal: "",
    qiandao_spec_id_normal: "",
    qiandao_tag_id_expert: "",
    qiandao_spec_id_expert: "",
    luosi_season_id_normal: "",
    luosi_season_id_expert: "",
  });

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
      if (!newSeasonStartedAt) {
        return Promise.reject(new Error("请输入开服时间"));
      }
      const startedAt = Math.floor(new Date(newSeasonStartedAt).getTime() / 1000);
      if (startedAt <= 0) {
        return Promise.reject(new Error("开服时间格式不正确"));
      }
      return cmd.initNewSeason(newSeasonId, newSeasonName || undefined, startedAt);
    },
    onSuccess: (result) => {
      toast.success(`新赛季 ${result.season_id} 初始化完成`);
      setSeasonId(result.season_id);
      setNewSeasonId("");
      setNewSeasonName("");
      setNewSeasonStartedAt("");
      setShowNewSeasonForm(false);
      seasonsQuery.refetch();
    },
    onError: (err: Error) => {
      toast.error(`初始化失败: ${err.message}`);
    },
  });

  const saveApiConfigMutation = useMutation({
    mutationFn: async () => {
      if (!editingApiSeason) throw new Error("未选择赛季");
      return cmd.setSeasonApiConfig(editingApiSeason, {
        qiandao_tag_id_normal: apiConfigForm.qiandao_tag_id_normal,
        qiandao_spec_id_normal: apiConfigForm.qiandao_spec_id_normal,
        qiandao_tag_id_expert: apiConfigForm.qiandao_tag_id_expert,
        qiandao_spec_id_expert: apiConfigForm.qiandao_spec_id_expert,
        luosi_season_id_normal: parseInt(apiConfigForm.luosi_season_id_normal || "0", 10),
        luosi_season_id_expert: parseInt(apiConfigForm.luosi_season_id_expert || "0", 10),
      });
    },
    onSuccess: () => {
      toast.success("API 配置已保存");
      setEditingApiSeason(null);
    },
    onError: (err: Error) => {
      toast.error(`保存失败: ${err.message}`);
    },
  });

  const loadApiConfig = async (seasonId: string) => {
    try {
      const config = await cmd.getSeasonApiConfig(seasonId);
      setApiConfigForm({
        qiandao_tag_id_normal: config.qiandao_tag_id_normal || "",
        qiandao_spec_id_normal: config.qiandao_spec_id_normal || "",
        qiandao_tag_id_expert: config.qiandao_tag_id_expert || "",
        qiandao_spec_id_expert: config.qiandao_spec_id_expert || "",
        luosi_season_id_normal: config.luosi_season_id_normal?.toString() || "",
        luosi_season_id_expert: config.luosi_season_id_expert?.toString() || "",
      });
      setEditingApiSeason(seasonId);
    } catch (err) {
      toast.error(`加载配置失败: ${err}`);
    }
  };

  useMutation<string, Error, void>({
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
    let mounted = true;
    const initPaths = async () => {
      try {
        const appDataDir = await cmd.getAppDataDir();
        return appDataDir;
      } catch {
        return "";
      }
    };

    initPaths().then((appDataDir) => {
      if (!mounted) return;
      const defaultPath = appDataDir ? getDefaultJsonPath(appDataDir) : "";
      cmd.getConfig().then((cfg) => {
        if (!mounted) return;
        setFireEnabled(cfg.scrape.fire_price_scrape_enabled);
        setFireInterval(cfg.scrape.fire_price_scrape_interval);
        setItemsEnabled(cfg.scrape.auto_reload);
        setItemsInterval(cfg.scrape.items_reload_interval);
        setItemsSource(cfg.scrape.items_source);
        setExpertEnabled(cfg.scrape.expert_enabled ?? false);
        setJsonPath(cfg.scrape.items_json_path || defaultPath);
        setSeasonId(cfg.app.season_id);
        setPriceAlertEnabled(cfg.notification.price_alert_enabled);
        setPriceAlertCooldown(cfg.notification.price_alert_cooldown_seconds);
        setSystemNotifications(cfg.notification.system_notifications);
        setVoiceAlertEnabled(cfg.notification.voice_alert_enabled);
        setVoiceAlertPath(cfg.notification.voice_alert_path || "");
        setLoaded(true);
        if (cfg.scrape.items_source === 'local') {
          cmd.validateJsonFile(cfg.scrape.items_json_path || defaultPath).then((v) => {
            if (mounted) setJsonPathValidation(v);
          }).catch(() => {});
        }
      }).catch(() => {});
    });

    cmd.getDashboardSummary().then((summary) => {
      if (!mounted) return;
      setItemCount(summary.item_count);
    }).catch(() => {});

    cmd.getNotificationPermissionStatus().then((status) => {
      if (!mounted) return;
      setNotificationPermission(status);
    }).catch(() => {});
    return () => { mounted = false; };
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
        expert_enabled: expertEnabled,
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
        voice_alert_path: voiceAlertPath,
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
    <PageShell size="lg" className="space-y-5">
      <PageHeader
        title="系统设置"
        description="配置应用参数、赛季信息和数据管理"
        icon={Settings}
        iconBg="bg-slate-100"
        iconColor="text-slate-600"
        actions={
          <ToolbarActions>
            <Button variant="default" size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-1.5" />
              保存设置
            </Button>
          </ToolbarActions>
        }
      />

      <Surface padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-[var(--color-ai)]" />
          <h2 className="text-sm font-semibold text-slate-700">赛季设置</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">当前赛季 ID</div>
              <div className="text-xs text-slate-400 mt-0.5">归档当前赛季后可初始化新赛季</div>
            </div>
            <StatusBadge variant="primary" className="px-4 py-1.5 text-sm font-semibold">
              {seasonId.toUpperCase()}
            </StatusBadge>
          </div>

          {/* Season Dates */}
          {seasonsQuery.data?.find(s => s.is_current) && (() => {
            const currentSeason = seasonsQuery.data.find(s => s.is_current);
            if (!currentSeason) return null;
            return (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div className="text-xs text-slate-400 mb-1">赛季开始日期</div>
                  <div className="text-sm font-medium text-slate-700">
                    {currentSeason.started_at 
                      ? new Date(currentSeason.started_at * 1000).toLocaleDateString('zh-CN')
                      : '未设置'
                    }
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div className="text-xs text-slate-400 mb-1">赛季状态</div>
                  <div className="text-sm font-medium text-green-600">
                    {currentSeason.ended_at 
                      ? `已结束 (${new Date(currentSeason.ended_at * 1000).toLocaleDateString('zh-CN')})`
                      : '进行中'
                    }
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Archive current season */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-700">归档当前赛季</div>
                <div className="text-xs text-slate-400 mt-0.5">将 {seasonId} 数据打包为历史赛季</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmArchiveOpen(true)}
                disabled={archiveMutation.isPending}
                className="border-amber-200 text-amber-600 hover:bg-amber-50"
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                {archiveMutation.isPending ? "归档中..." : "归档赛季"}
              </Button>
            </div>
          </div>

          {/* Initialize new season */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-slate-700">初始化新赛季</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {seasonsQuery.data?.some(s => s.is_current)
                    ? "请先归档当前赛季后再创建新赛季"
                    : "当前无进行中的赛季，可以创建新赛季"
                  }
                </div>
              </div>
              {!showNewSeasonForm && (
                <Button
                  size="sm"
                  onClick={() => setShowNewSeasonForm(true)}
                  disabled={seasonsQuery.data?.some(s => s.is_current) ?? false}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  新建赛季
                </Button>
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
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">开服时间 *</label>
                    <input
                      type="datetime-local"
                      value={newSeasonStartedAt}
                      onChange={(e) => setNewSeasonStartedAt(e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    <p className="text-xs text-slate-400 mt-0.5">必填，请输入正确的开服时间</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowNewSeasonForm(false);
                      setNewSeasonId("");
                      setNewSeasonName("");
                      setNewSeasonStartedAt("");
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setConfirmNewSeasonOpen(true)}
                    disabled={!newSeasonId || initNewSeasonMutation.isPending}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    {initNewSeasonMutation.isPending ? "初始化中..." : "确认初始化"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* API Config for Current Season */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Key className="w-4 h-4 text-slate-500" />
                当前赛季 API 参数配置
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadApiConfig(seasonId)}
                className="text-xs"
              >
                <Edit3 className="w-3 h-3 mr-1" />
                {editingApiSeason === seasonId ? "收起" : "配置"}
              </Button>
            </div>

            {/* API Config Edit Form */}
            {editingApiSeason === seasonId && (
              <div className="space-y-4 bg-amber-50 rounded-lg p-4 border border-amber-100">
                {/* Qiandao API */}
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                    千岛火价 API 参数
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">普通服 tagId</label>
                      <input
                        type="text"
                        value={apiConfigForm.qiandao_tag_id_normal}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, qiandao_tag_id_normal: e.target.value })}
                        placeholder="如 1560053"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">普通服 specId</label>
                      <input
                        type="text"
                        value={apiConfigForm.qiandao_spec_id_normal}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, qiandao_spec_id_normal: e.target.value })}
                        placeholder="如 267416"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">专家服 tagId</label>
                      <input
                        type="text"
                        value={apiConfigForm.qiandao_tag_id_expert}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, qiandao_tag_id_expert: e.target.value })}
                        placeholder="如 1560055"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">专家服 specId</label>
                      <input
                        type="text"
                        value={apiConfigForm.qiandao_spec_id_expert}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, qiandao_spec_id_expert: e.target.value })}
                        placeholder="如 267417"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>
                </div>

                {/* 物品火价 API */}
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                    物品火价 API 参数
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">普通服 season_id</label>
                      <input
                        type="number"
                        value={apiConfigForm.luosi_season_id_normal}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, luosi_season_id_normal: e.target.value })}
                        placeholder="如 1401"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">专家服 season_id</label>
                      <input
                        type="number"
                        value={apiConfigForm.luosi_season_id_expert}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, luosi_season_id_expert: e.target.value })}
                        placeholder="如 1431"
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingApiSeason(null)}
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveApiConfigMutation.mutate()}
                    disabled={saveApiConfigMutation.isPending}
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {saveApiConfigMutation.isPending ? "保存中..." : "保存配置"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Surface>

      {/* Price Alert settings */}
      <Surface padding="lg">
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
                  <div className={`w-2 h-2 rounded-full ${notificationPermission.granted ? 'bg-[var(--color-success)]' : notificationPermission.denied ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-brand-gold)]'}`}></div>
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
                <div className="w-[36px] h-[20px] bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-full transition-all duration-200 peer-checked:bg-gradient-to-r peer-checked:from-[var(--color-brand)] peer-checked:to-[var(--color-brand-gold)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-brand)]/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--color-text-subtle)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
              </label>
              {!notificationPermission?.granted && (
                <Button
                  size="sm"
                  onClick={() => requestPermissionMutation.mutate()}
                  disabled={requestPermissionMutation.isPending}
                  className="text-xs"
                >
                  {requestPermissionMutation.isPending ? '申请中...' : '申请权限'}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">开启语音提醒</div>
              <div className="text-xs text-slate-400 mt-0.5">预警触发时播放语音提示</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={voiceAlertEnabled}
                onChange={(e) => setVoiceAlertEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-[36px] h-[20px] bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-full transition-all duration-200 peer-checked:bg-gradient-to-r peer-checked:from-[var(--color-brand)] peer-checked:to-[var(--color-brand-gold)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-brand)]/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--color-text-subtle)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          {voiceAlertEnabled && (
            <div className="flex items-center justify-between pl-4 border-l-2 border-[var(--color-brand)]/30">
              <div>
                <div className="text-sm font-medium text-slate-600">语音文件路径</div>
                <div className="text-xs text-slate-400 mt-0.5">支持 .mp3 或 .wav 文件（留空或路径失效时使用内置萝莉音）</div>
              </div>
              <input
                type="text"
                value={voiceAlertPath}
                onChange={(e) => setVoiceAlertPath(e.target.value)}
                placeholder="留空使用内置萝莉音"
                className="w-64 text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          )}

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
              <div className="w-[36px] h-[20px] bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-full transition-all duration-200 peer-checked:bg-gradient-to-r peer-checked:from-[var(--color-brand)] peer-checked:to-[var(--color-brand-gold)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-brand)]/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--color-text-subtle)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
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


        </div>
      </Surface>

      {/* Fire price settings */}
      <Surface padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-700">火价监控</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">自动采集火价</div>
              <div className="text-xs text-slate-400 mt-0.5">定时从千岛获取当前赛季火价数据</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={fireEnabled}
                onChange={(e) => setFireEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-[36px] h-[20px] bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-full transition-all duration-200 peer-checked:bg-gradient-to-r peer-checked:from-[var(--color-brand)] peer-checked:to-[var(--color-brand-gold)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-brand)]/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--color-text-subtle)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">采集间隔</div>
              <div className="text-xs text-slate-400 mt-0.5">两次火价采集之间的时间间隔</div>
            </div>
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
      </Surface>

      {/* Items data settings */}
      <Surface padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-[var(--color-brand)]" />
          <h2 className="text-sm font-semibold text-slate-700">物品数据</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">自动同步物品价格</div>
              <div className="text-xs text-slate-400 mt-0.5">定时从小助手获取当前赛季物品价格数据</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={itemsEnabled}
                onChange={(e) => setItemsEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-[36px] h-[20px] bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-full transition-all duration-200 peer-checked:bg-gradient-to-r peer-checked:from-[var(--color-brand)] peer-checked:to-[var(--color-brand-gold)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-brand)]/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--color-text-subtle)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">同步间隔</div>
              <div className="text-xs text-slate-400 mt-0.5">两次物品价格同步之间的时间间隔</div>
            </div>
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
            <div>
              <div className="text-sm font-medium text-slate-700">数据来源</div>
              <div className="text-xs text-slate-400 mt-0.5">选择物品价格的获取方式</div>
            </div>
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

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">同步专家服数据</div>
              <div className="text-xs text-slate-400 mt-0.5">同时抓取赛季专家的物品价格数据</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={expertEnabled}
                onChange={(e) => setExpertEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-[36px] h-[20px] bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-full transition-all duration-200 peer-checked:bg-gradient-to-r peer-checked:from-[var(--color-brand)] peer-checked:to-[var(--color-brand-gold)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-brand)]/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--color-text-subtle)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
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
                <div className={`flex items-center gap-1 text-xs ${jsonPathValidation.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                  {jsonPathValidation.valid ? (
                    <span className="w-2 h-2 rounded-full bg-[var(--color-success)]"></span>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[var(--color-danger)]"></span>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClearOpen(true)}
                disabled={clearMutation.isPending}
                className="border-red-200 text-red-500 hover:bg-red-50"
                title="清空物品数据库，重新抓取"
              >
                <Trash2 className={`w-3.5 h-3.5 ${clearMutation.isPending ? "animate-spin" : ""} mr-1.5`} />
                {clearMutation.isPending ? "清空中…" : "清空数据库"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshItems}
                disabled={refreshMutation.isPending}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshMutation.isPending ? "animate-spin" : ""} mr-1.5`} />
                {refreshMutation.isPending ? "同步中…" : "立即同步"}
              </Button>
            </div>
          </div>
        </div>
      </Surface>

      {/* Version */}
      <Surface padding="lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700">当前版本</div>
            <div className="text-xs text-slate-400 mt-0.5">v2.0.0 · Tauri 2.0</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("https://github.com/your-repo/releases", "_blank")}
          >
            检查更新
          </Button>
        </div>
      </Surface>

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
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          <Save className="w-4 h-4 mr-1.5" />
          {saveMutation.isPending ? "保存中…" : "保存设置"}
        </Button>
      </div>
    </PageShell>
  );
}
