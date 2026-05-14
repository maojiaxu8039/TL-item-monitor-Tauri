import { useState, useEffect } from "react";
import { cmd, type AppConfig, type OkResponse, type NotificationPermissionStatus, type JsonFileValidationResult, type SeasonInfo } from "@/lib/commands";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, Save, Bell, BellRing, Database, Globe, AlertTriangle, Trash2, Edit3, Key, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";

const INTERVAL_OPTIONS = [
  { label: "30 秒", value: 30 },
  { label: "1 分钟", value: 60 },
  { label: "3 分钟", value: 180 },
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

  const buildConfig = (): AppConfig => ({
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
      mac_desktop_notifications: systemNotifications,
      win_desktop_notifications: systemNotifications,
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

  const testNotificationMutation = useMutation<OkResponse, Error, void>({
    mutationFn: async () => {
      await cmd.saveConfig(buildConfig());
      return cmd.testNotification();
    },
    onSuccess: () => {
      toast.success(voiceAlertEnabled ? "系统通知和语音测试已触发" : "系统通知测试已触发");
      cmd.getNotificationPermissionStatus().then((status) => {
        setNotificationPermission(status);
      }).catch(() => {});
    },
    onError: (err) => {
      toast.error(`测试失败: ${err.message || err}`);
    },
  });

  const triggerAlertMutation = useMutation<string, Error, void>({
    mutationFn: async () => {
      await cmd.saveConfig(buildConfig());
      return cmd.triggerPriceAlert();
    },
    onSuccess: (result) => {
      toast.success(result);
    },
    onError: (err) => {
      toast.error(`触发失败: ${err.message || err}`);
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
    saveMutation.mutate(buildConfig());
  };

  const handleRefreshItems = () => {
    refreshMutation.mutate();
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-5 h-5 text-[var(--color-text-subtle)] animate-spin" />
      </div>
    );
  }

  return (
    <PageShell size="lg" className="space-y-5">
      <PageHeader
        title="系统设置"
        description="配置应用参数、赛季信息和数据管理"
        iconAsset="settings"
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
          <h2 className="text-sm font-semibold text-[var(--color-text)]">赛季设置</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)]">当前赛季 ID</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">赛季归档与初始化由服务器端统一处理</div>
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
                <div className="bg-[var(--color-panel-soft)] rounded-lg p-3 border border-[var(--color-border-soft)]">
                  <div className="text-xs text-[var(--color-text-subtle)] mb-1">赛季开始日期</div>
                  <div className="text-sm font-medium text-[var(--color-text)]">
                    {currentSeason.started_at 
                      ? new Date(currentSeason.started_at * 1000).toLocaleDateString('zh-CN')
                      : '未设置'
                    }
                  </div>
                </div>
                <div className="bg-[var(--color-panel-soft)] rounded-lg p-3 border border-[var(--color-border-soft)]">
                  <div className="text-xs text-[var(--color-text-subtle)] mb-1">赛季状态</div>
                  <div className="text-sm font-medium text-[var(--color-success)]">
                    {currentSeason.ended_at 
                      ? `已结束 (${new Date(currentSeason.ended_at * 1000).toLocaleDateString('zh-CN')})`
                      : '进行中'
                    }
                  </div>
                </div>
              </div>
            );
          })()}

          {/* API Config for Current Season */}
          <div className="border-t border-[var(--color-border-soft)] pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2">
                <Key className="w-4 h-4 text-[var(--color-text-subtle)]" />
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
              <div className="space-y-4 bg-[rgba(255,184,0,0.08)] rounded-lg p-4 border border-[rgba(255,184,0,0.2)]">
                {/* Qiandao API */}
                <div>
                  <div className="text-xs font-medium text-[var(--color-text-subtle)] uppercase tracking-wider mb-2">
                    千岛火价 API 参数
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--color-text-subtle)] block mb-1">普通服 tagId</label>
                      <input
                        type="text"
                        value={apiConfigForm.qiandao_tag_id_normal}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, qiandao_tag_id_normal: e.target.value })}
                        placeholder="如 1560053"
                        className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-subtle)] block mb-1">普通服 specId</label>
                      <input
                        type="text"
                        value={apiConfigForm.qiandao_spec_id_normal}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, qiandao_spec_id_normal: e.target.value })}
                        placeholder="如 267416"
                        className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-subtle)] block mb-1">专家服 tagId</label>
                      <input
                        type="text"
                        value={apiConfigForm.qiandao_tag_id_expert}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, qiandao_tag_id_expert: e.target.value })}
                        placeholder="如 1560055"
                        className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-subtle)] block mb-1">专家服 specId</label>
                      <input
                        type="text"
                        value={apiConfigForm.qiandao_spec_id_expert}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, qiandao_spec_id_expert: e.target.value })}
                        placeholder="如 267417"
                        className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
                      />
                    </div>
                  </div>
                </div>

                {/* 物品火价 API */}
                <div>
                  <div className="text-xs font-medium text-[var(--color-text-subtle)] uppercase tracking-wider mb-2">
                    物品火价 API 参数
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--color-text-subtle)] block mb-1">普通服 season_id</label>
                      <input
                        type="number"
                        value={apiConfigForm.luosi_season_id_normal}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, luosi_season_id_normal: e.target.value })}
                        placeholder="如 1401"
                        className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--color-text-subtle)] block mb-1">专家服 season_id</label>
                      <input
                        type="number"
                        value={apiConfigForm.luosi_season_id_expert}
                        onChange={(e) => setApiConfigForm({ ...apiConfigForm, luosi_season_id_expert: e.target.value })}
                        placeholder="如 1431"
                        className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
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
          <AlertTriangle className="w-4 h-4 text-[var(--color-brand-gold)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">价格预警设置</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-sm font-medium text-[var(--color-text)]">开启系统通知</div>
                <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">开启后将在发现值得购买的物品时发送桌面通知</div>
              </div>
              {notificationPermission && (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${notificationPermission.granted ? 'bg-[var(--color-success)]' : notificationPermission.denied ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-brand-gold)]'}`}></div>
                  <span className="text-xs text-[var(--color-text-subtle)]">
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
              <div className="text-sm font-medium text-[var(--color-text)]">开启语音提醒</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">预警触发时播放语音提示</div>
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
                <div className="text-sm font-medium text-[var(--color-text-muted)]">语音文件路径</div>
                <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">支持 .mp3 或 .wav 文件（留空或路径失效时使用内置萝莉音）</div>
              </div>
              <input
                type="text"
                value={voiceAlertPath}
                onChange={(e) => setVoiceAlertPath(e.target.value)}
                placeholder="留空使用内置萝莉音"
                className="w-64 text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)]">开启价格预警弹窗</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">当监控物品变得"值的"时弹出通知提醒</div>
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
                <div className="text-sm font-medium text-[var(--color-text)]">预警间隔时间</div>
                <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">预警触发后的等待时间</div>
              </div>
              <select
                value={priceAlertCooldown}
                onChange={(e) => setPriceAlertCooldown(Number(e.target.value))}
                className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
              >
                {COOLDOWN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--color-border-soft)]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testNotificationMutation.mutate()}
              disabled={testNotificationMutation.isPending}
            >
              {voiceAlertEnabled ? (
                <Volume2 className="w-4 h-4 mr-1.5" />
              ) : (
                <BellRing className="w-4 h-4 mr-1.5" />
              )}
              {testNotificationMutation.isPending ? "测试中..." : "测试通知/语音"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => triggerAlertMutation.mutate()}
              disabled={triggerAlertMutation.isPending}
            >
              <AlertTriangle className="w-4 h-4 mr-1.5" />
              {triggerAlertMutation.isPending ? "触发中..." : "触发满足条件预警"}
            </Button>
          </div>

        </div>
      </Surface>

      {/* Fire price settings */}
      <Surface padding="lg">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-[var(--color-danger)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">火价监控</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)]">自动采集火价</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">定时从千岛获取当前赛季火价数据</div>
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
              <div className="text-sm font-medium text-[var(--color-text)]">采集间隔</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">两次火价采集之间的时间间隔</div>
            </div>
            <select
              value={fireInterval}
              onChange={(e) => setFireInterval(Number(e.target.value))}
              disabled={!fireEnabled}
              className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <h2 className="text-sm font-semibold text-[var(--color-text)]">物品数据</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)]">自动同步物品价格</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">定时从小助手获取当前赛季物品价格数据</div>
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
              <div className="text-sm font-medium text-[var(--color-text)]">同步间隔</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">两次物品价格同步之间的时间间隔</div>
            </div>
            <select
              value={itemsInterval}
              onChange={(e) => setItemsInterval(Number(e.target.value))}
              disabled={!itemsEnabled}
              className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="text-sm font-medium text-[var(--color-text)]">数据来源</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">选择物品价格的获取方式</div>
            </div>
            <select
              value={itemsSource}
              onChange={(e) => handleItemsSourceChange(e.target.value)}
              className="text-sm border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-[var(--color-text)] bg-[var(--color-panel-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30"
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
              <div className="text-sm font-medium text-[var(--color-text)]">同步专家服数据</div>
              <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">同时抓取赛季专家的物品价格数据</div>
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
            <div className="text-sm font-medium text-[var(--color-text)]">本地JSON路径</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={jsonPath}
                onChange={(e) => handleJsonPathChange(e.target.value)}
                readOnly={itemsSource !== 'local'}
                className={`text-xs border rounded-lg px-3 py-1.5 w-72 overflow-hidden text-ellipsis ${
                  itemsSource === 'local' 
                    ? 'border-[var(--color-border)] text-[var(--color-text)] bg-[var(--color-panel)] focus:ring-2 focus:ring-[var(--color-brand)]/30' 
                    : 'border-[var(--color-border)] text-[var(--color-text-subtle)] bg-[var(--color-panel-soft)]'
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
            <div className="text-sm text-[var(--color-text-subtle)]">
              已加载 <span className="font-semibold text-[var(--color-text)]">{itemCount}</span> 个物品
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClearOpen(true)}
                disabled={clearMutation.isPending}
                className="border-[rgba(239,68,68,0.25)] text-[var(--color-danger)] hover:bg-[rgba(239,68,68,0.1)]"
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
            <div className="text-sm font-medium text-[var(--color-text)]">当前版本</div>
            <div className="text-xs text-[var(--color-text-subtle)] mt-0.5">v2.0.0 · Tauri 2.0</div>
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
