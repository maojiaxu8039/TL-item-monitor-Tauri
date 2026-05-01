import { useState, useEffect } from "react";
import { cmd, type AppConfig, type OkResponse, type NotificationPermissionStatus } from "@/lib/commands";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw, Save, Settings, Bell, Database, Globe, AlertTriangle, Trash2, Volume2 } from "lucide-react";
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
  { label: "千岛 API", value: "api" },
  { label: "本地 JSON", value: "local" },
  { label: "其他", value: "other" },
];

const DEFAULT_JSON_PATH = "/Users/mc/Library/Application Support/com.tlmonitor.app/data/full_table.json";

export default function SettingsPage() {
  const [fireEnabled, setFireEnabled] = useState(true);
  const [fireInterval, setFireInterval] = useState(300);
  const [itemsEnabled, setItemsEnabled] = useState(false);
  const [itemsInterval, setItemsInterval] = useState(300);
  const [itemsSource, setItemsSource] = useState("api");
  const [jsonPath] = useState(DEFAULT_JSON_PATH);
  const [seasonId, setSeasonId] = useState("ss12");
  const [itemCount, setItemCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(true);
  const [priceAlertCooldown, setPriceAlertCooldown] = useState(600);
  const [systemNotifications, setSystemNotifications] = useState(true);
  const [voiceAlertEnabled, setVoiceAlertEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionStatus | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const saveMutation = useMutation<OkResponse, Error, AppConfig>({
    mutationFn: (config) => cmd.saveConfig(config),
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
      setSeasonId(cfg.app.season_id);
      setPriceAlertEnabled(cfg.notification.price_alert_enabled);
      setPriceAlertCooldown(cfg.notification.price_alert_cooldown_seconds);
      setSystemNotifications(cfg.notification.system_notifications);
      setVoiceAlertEnabled(cfg.notification.voice_alert_enabled);
      setLoaded(true);
    }).catch(() => {});

    cmd.getDashboardSummary().then((summary) => {
      setItemCount(summary.item_count);
    }).catch(() => {});

    cmd.getNotificationPermissionStatus().then((status) => {
      setNotificationPermission(status);
    }).catch(() => {});
  }, []);

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
                <div className="text-sm font-medium text-slate-700">冷却时间</div>
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
              onChange={(e) => setItemsSource(e.target.value)}
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
            <div className="text-sm font-medium text-slate-700">JSON 路径</div>
            <input
              type="text"
              value={jsonPath}
              readOnly
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-400 bg-slate-50 w-72 overflow-hidden text-ellipsis"
            />
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

      {/* Season settings */}
      <section className="bg-white rounded-xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-purple-500" />
          <h2 className="text-sm font-semibold text-slate-700">赛季设置</h2>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-slate-700">赛季 ID</div>
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