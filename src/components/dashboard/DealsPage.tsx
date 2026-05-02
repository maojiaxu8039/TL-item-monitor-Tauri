import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tag, TrendingDown, TrendingUp, Loader2, Package, Clock, ArrowDown, ArrowUp, Settings } from "lucide-react";
import { cmd, type DealAlert } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

// ─── Types ─────────────────────────────────────────────────────────────────

interface DealSettings {
  bargain_enabled: boolean;
  bargain_threshold_percent: number;
  sell_enabled: boolean;
  sell_threshold_percent: number;
}

// ─── Alert Card ────────────────────────────────────────────────────────────

function AlertCard({ alert, type }: { alert: DealAlert; type: "bargain" | "sell" }) {
  const isBargain = type === "bargain";
  
  return (
    <div className={`bg-white rounded-lg border p-3 transition-colors hover:shadow-sm ${
      isBargain ? "border-green-200 hover:border-green-300" : "border-red-200 hover:border-red-300"
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Package className={`w-4 h-4 ${isBargain ? "text-green-500" : "text-red-500"}`} />
          <div>
            <div className="text-sm font-medium text-slate-900">{alert.item_name}</div>
            {alert.item_type && (
              <span className="text-xs text-slate-400">{alert.item_type}</span>
            )}
          </div>
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded ${
          isBargain 
            ? "bg-green-100 text-green-700" 
            : "bg-red-100 text-red-700"
        }`}>
          {isBargain ? "捡漏" : "出货"}
        </div>
      </div>
      
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            之前: <span className="font-medium text-slate-700">{alert.previous_price.toFixed(2)}</span>
          </div>
          <ArrowDown className="w-3 h-3 text-slate-400" />
          <div className="text-xs text-slate-500">
            现在: <span className={`font-medium ${isBargain ? "text-green-600" : "text-red-600"}`}>
              {alert.current_price.toFixed(2)}
            </span>
          </div>
        </div>
        <div className={`text-sm font-bold ${isBargain ? "text-green-600" : "text-red-600"}`}>
          {isBargain ? "↓" : "↑"} {Math.abs(alert.change_percent).toFixed(1)}%
        </div>
      </div>
      
      <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
        <Clock className="w-3 h-3" />
        {new Date(alert.detected_at * 1000).toLocaleTimeString()}
      </div>
    </div>
  );
}

// ─── Settings Modal ────────────────────────────────────────────────────────

function SettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: DealSettings;
  onSave: (settings: DealSettings) => void;
  onClose: () => void;
}) {
  const [bargainEnabled, setBargainEnabled] = useState(settings.bargain_enabled);
  const [bargainThreshold, setBargainThreshold] = useState(settings.bargain_threshold_percent);
  const [sellEnabled, setSellEnabled] = useState(settings.sell_enabled);
  const [sellThreshold, setSellThreshold] = useState(settings.sell_threshold_percent);

  const handleSave = () => {
    onSave({
      bargain_enabled: bargainEnabled,
      bargain_threshold_percent: bargainThreshold,
      sell_enabled: sellEnabled,
      sell_threshold_percent: sellThreshold,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">捡漏出货设置</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        
        <div className="p-5 space-y-5">
          {/* Bargain Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-slate-700">开启捡漏监控</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={bargainEnabled}
                  onChange={(e) => setBargainEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>
            
            {bargainEnabled && (
              <div className="pl-6">
                <div className="text-xs text-slate-500 mb-1.5">价格下跌超过此百分比时触发捡漏提醒</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={5}
                    max={90}
                    step={5}
                    value={bargainThreshold}
                    onChange={(e) => setBargainThreshold(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                  />
                  <span className="text-sm font-medium text-green-600 w-12 text-right">{bargainThreshold}%</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>5%</span>
                  <span>90%</span>
                </div>
              </div>
            )}
          </div>

          {/* Sell Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-slate-700">开启出货监控</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={sellEnabled}
                  onChange={(e) => setSellEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
              </label>
            </div>
            
            {sellEnabled && (
              <div className="pl-6">
                <div className="text-xs text-slate-500 mb-1.5">价格上涨超过此百分比时触发出货提醒</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={5}
                    max={90}
                    step={5}
                    value={sellThreshold}
                    onChange={(e) => setSellThreshold(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                  <span className="text-sm font-medium text-red-600 w-12 text-right">{sellThreshold}%</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>5%</span>
                  <span>90%</span>
                </div>
              </div>
            )}
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
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function DealsPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<DealSettings>({
    bargain_enabled: true,
    bargain_threshold_percent: 30,
    sell_enabled: true,
    sell_threshold_percent: 30,
  });
  const { marketContext } = useSectionRefresh();

  // Load settings from config
  useEffect(() => {
    cmd.getConfig().then((cfg) => {
      if (cfg.deal) {
        setSettings(cfg.deal);
      }
    }).catch(() => {});
  }, []);

  // Fetch deal alerts
  const { data: alertsData, isLoading, refetch } = useQuery({
    queryKey: ["deal-alerts", marketContext.seasonId, settings],
    queryFn: () => cmd.getDealAlerts(),
    refetchInterval: 60000, // Refresh every minute
    enabled: settings.bargain_enabled || settings.sell_enabled,
  });

  const handleSaveSettings = (newSettings: DealSettings) => {
    setSettings(newSettings);
    cmd.getConfig().then((cfg) => {
      const updatedConfig = {
        ...cfg,
        deal: newSettings,
      };
      cmd.saveConfig(updatedConfig).then(() => {
        refetch();
      }).catch(() => {});
    }).catch(() => {});
  };

  const bargains = alertsData?.bargains || [];
  const sells = alertsData?.sells || [];

  // Filter by threshold
  const filteredBargains = bargains.filter(
    (a) => Math.abs(a.change_percent) >= settings.bargain_threshold_percent
  );
  const filteredSells = sells.filter(
    (a) => Math.abs(a.change_percent) >= settings.sell_threshold_percent
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900">捡漏出货</h1>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {settings.bargain_enabled && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                捡漏 ≥{settings.bargain_threshold_percent}%
              </span>
            )}
            {settings.sell_enabled && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded">
                出货 ≥{settings.sell_threshold_percent}%
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings className="w-4 h-4" />
          设置阈值
        </button>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-4">
        {/* Bargain Column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <TrendingDown className="w-4 h-4 text-green-500" />
            <h2 className="text-sm font-semibold text-slate-700">捡漏机会</h2>
            <span className="text-xs text-slate-400">价格下跌超过 {settings.bargain_threshold_percent}%</span>
          </div>
          
          {!settings.bargain_enabled ? (
            <div className="bg-slate-50 rounded-lg border border-slate-200 py-12 text-center">
              <TrendingDown className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm text-slate-400">捡漏监控已关闭</div>
              <div className="text-xs text-slate-400 mt-1">请在设置中开启</div>
            </div>
          ) : isLoading ? (
            <div className="bg-slate-50 rounded-lg border border-slate-200 py-12 text-center">
              <Loader2 className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-spin" />
              <div className="text-sm text-slate-400">检测中...</div>
            </div>
          ) : filteredBargains.length === 0 ? (
            <div className="bg-slate-50 rounded-lg border border-slate-200 py-12 text-center">
              <TrendingDown className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm text-slate-400">暂无捡漏机会</div>
              <div className="text-xs text-slate-400 mt-1">价格下跌超过 {settings.bargain_threshold_percent}% 时将显示</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredBargains.map((alert) => (
                <AlertCard key={alert.item_id} alert={alert} type="bargain" />
              ))}
            </div>
          )}
        </div>

        {/* Sell Column */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-slate-700">出货机会</h2>
            <span className="text-xs text-slate-400">价格上涨超过 {settings.sell_threshold_percent}%</span>
          </div>
          
          {!settings.sell_enabled ? (
            <div className="bg-slate-50 rounded-lg border border-slate-200 py-12 text-center">
              <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm text-slate-400">出货监控已关闭</div>
              <div className="text-xs text-slate-400 mt-1">请在设置中开启</div>
            </div>
          ) : isLoading ? (
            <div className="bg-slate-50 rounded-lg border border-slate-200 py-12 text-center">
              <Loader2 className="w-8 h-8 text-slate-300 mx-auto mb-2 animate-spin" />
              <div className="text-sm text-slate-400">检测中...</div>
            </div>
          ) : filteredSells.length === 0 ? (
            <div className="bg-slate-50 rounded-lg border border-slate-200 py-12 text-center">
              <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm text-slate-400">暂无出货机会</div>
              <div className="text-xs text-slate-400 mt-1">价格上涨超过 {settings.sell_threshold_percent}% 时将显示</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSells.map((alert) => (
                <AlertCard key={alert.item_id} alert={alert} type="sell" />
              ))}
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
