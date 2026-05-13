import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Loader2, Settings, RefreshCw, Package } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toolbar, ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";
import { cmd, type FirePriceChangeItem } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

interface FireChangeCardProps {
  item: FirePriceChangeItem;
  isRising: boolean;
}

function FireChangeCard({ item, isRising }: FireChangeCardProps) {
  const maxChange = useMemo(() => Math.max(
    Math.abs(item.change_rate_3h ?? 0),
    Math.abs(item.change_rate_1h ?? 0),
    Math.abs(item.change_rate_30m ?? 0),
    Math.abs(item.change_rate_5m ?? 0)
  ), [item.change_rate_3h, item.change_rate_1h, item.change_rate_30m, item.change_rate_5m]);

  return (
    <Surface
      interactive
      padding="sm"
      className={`transition-colors ${
        isRising ? "border-[rgba(239,68,68,0.2)] hover:border-red-200" : "border-green-100 hover:border-green-200"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Package className={`w-4 h-4 ${isRising ? "text-red-500" : "text-green-500"}`} />
          <div>
            <div className="text-sm font-medium text-slate-900">{item.name}</div>
            <div className="text-xs text-[var(--color-text-subtle)]">
              价格: {item.current_price.toFixed(2)} 火 |
              变动: {maxChange.toFixed(2)}% |
              评分: {item.score.toFixed(2)}
            </div>
          </div>
        </div>
        <StatusBadge variant={isRising ? "danger" : "success"}>
          {item.trend === "sharp_rise" ? "暴涨" : item.trend === "rise" ? "上涨" : item.trend === "sharp_fall" ? "暴跌" : item.trend === "fall" ? "下跌" : "平稳"}
        </StatusBadge>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <div className="text-center p-1.5 bg-[var(--color-panel-soft)] rounded">
          <div className="text-[var(--color-text-subtle)]">5m</div>
          <div className={`font-medium ${(item.change_rate_5m ?? 0) >= 0 ? "text-red-500" : "text-green-500"}`}>
            {item.change_rate_5m !== null ? `${(item.change_rate_5m ?? 0) >= 0 ? "+" : ""}${item.change_rate_5m?.toFixed(1)}%` : "-"}
          </div>
        </div>
        <div className="text-center p-1.5 bg-[var(--color-panel-soft)] rounded">
          <div className="text-[var(--color-text-subtle)]">30m</div>
          <div className={`font-medium ${(item.change_rate_30m ?? 0) >= 0 ? "text-red-500" : "text-green-500"}`}>
            {item.change_rate_30m !== null ? `${(item.change_rate_30m ?? 0) >= 0 ? "+" : ""}${item.change_rate_30m?.toFixed(1)}%` : "-"}
          </div>
        </div>
        <div className="text-center p-1.5 bg-[var(--color-panel-soft)] rounded">
          <div className="text-[var(--color-text-subtle)]">1h</div>
          <div className={`font-medium ${(item.change_rate_1h ?? 0) >= 0 ? "text-red-500" : "text-green-500"}`}>
            {item.change_rate_1h !== null ? `${(item.change_rate_1h ?? 0) >= 0 ? "+" : ""}${item.change_rate_1h?.toFixed(1)}%` : "-"}
          </div>
        </div>
        <div className="text-center p-1.5 bg-[var(--color-panel-soft)] rounded">
          <div className="text-[var(--color-text-subtle)]">3h</div>
          <div className={`font-medium ${(item.change_rate_3h ?? 0) >= 0 ? "text-red-500" : "text-green-500"}`}>
            {item.change_rate_3h !== null ? `${(item.change_rate_3h ?? 0) >= 0 ? "+" : ""}${item.change_rate_3h?.toFixed(1)}%` : "-"}
          </div>
        </div>
      </div>
    </Surface>
  );
}

interface SettingsModalProps {
  settings: { rise_threshold: number; fall_threshold: number };
  onSave: (settings: { rise_threshold: number; fall_threshold: number }) => void;
  onClose: () => void;
}

function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [riseThreshold, setRiseThreshold] = useState(settings.rise_threshold);
  const [fallThreshold, setFallThreshold] = useState(settings.fall_threshold);

  const handleSave = () => {
    onSave({ rise_threshold: riseThreshold, fall_threshold: fallThreshold });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[var(--color-panel)] rounded-2xl shadow-2xl w-[480px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-soft)]">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[var(--color-text-subtle)]" />
            <h2 className="text-lg font-semibold text-[var(--color-text)]">监控设置</h2>
          </div>
          <button onClick={onClose} className="text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]">✕</button>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-[var(--color-text)]">出货阈值</span>
              </div>
              <span className="text-sm font-medium text-red-600">{riseThreshold}%</span>
            </div>
            <div className="pl-6">
              <div className="text-xs text-[var(--color-text-subtle)] mb-1.5">涨幅超过此百分比时显示为出货机会</div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={riseThreshold}
                onChange={(e) => setRiseThreshold(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <div className="flex justify-between text-xs text-[var(--color-text-subtle)] mt-1">
                <span>1%</span>
                <span>50%</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-[var(--color-text)]">捡漏阈值</span>
              </div>
              <span className="text-sm font-medium text-green-600">{fallThreshold}%</span>
            </div>
            <div className="pl-6">
              <div className="text-xs text-[var(--color-text-subtle)] mb-1.5">跌幅超过此百分比时显示为捡漏机会</div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={fallThreshold}
                onChange={(e) => setFallThreshold(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="flex justify-between text-xs text-[var(--color-text-subtle)] mt-1">
                <span>1%</span>
                <span>50%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-panel-soft)] rounded-lg transition-colors">取消</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] text-white rounded-lg hover:opacity-90 transition-opacity">保存设置</button>
        </div>
      </div>
    </div>
  );
}

export default function DealsPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ rise_threshold: 5, fall_threshold: 5 });
  useSectionRefresh();

  useEffect(() => {
    const savedSettings = localStorage.getItem("deals-settings");
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  const { data: fireChanges = [], isLoading, refetch } = useQuery({
    queryKey: ["realtime-fire-changes"],
    queryFn: () => cmd.getRealtimeFireChanges(),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const handleSaveSettings = (newSettings: { rise_threshold: number; fall_threshold: number }) => {
    setSettings(newSettings);
    localStorage.setItem("deals-settings", JSON.stringify(newSettings));
  };

  const riseItems = fireChanges.filter(item => {
    if (!item.trend.includes("rise")) return false;
    const maxChange = Math.max(
      Math.abs(item.change_rate_3h ?? 0),
      Math.abs(item.change_rate_1h ?? 0),
      Math.abs(item.change_rate_30m ?? 0),
      Math.abs(item.change_rate_5m ?? 0)
    );
    return maxChange >= settings.rise_threshold;
  });

  const fallItems = fireChanges.filter(item => {
    if (!item.trend.includes("fall")) return false;
    const maxChange = Math.max(
      Math.abs(item.change_rate_3h ?? 0),
      Math.abs(item.change_rate_1h ?? 0),
      Math.abs(item.change_rate_30m ?? 0),
      Math.abs(item.change_rate_5m ?? 0)
    );
    return maxChange >= settings.fall_threshold;
  });

  return (
    <PageShell size="xl" className="h-full flex flex-col">
      <PageHeader
        title="捡漏出货"
        description={`实时监控物品价格变化，自动检测涨跌机会 | 出货≥${settings.rise_threshold}% 捡漏≥${settings.fall_threshold}%`}
        icon={TrendingUp}
        iconBg="bg-orange-50"
        iconColor="text-[var(--color-brand-gold)]"
        actions={
          <ToolbarActions>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              刷新
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="w-4 h-4 mr-1.5" />
              设置
            </Button>
          </ToolbarActions>
        }
      />

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
              <span className="text-[var(--color-text-subtle)]">加载中...</span>
            </div>
          </div>
        ) : fireChanges.length === 0 ? (
          <EmptyState
            title="暂无数据"
            description="请先在数据监控页面同步物品数据"
            icon={Package}
          />
        ) : (
          <div className="grid grid-cols-2 gap-6 h-full">
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-1 mb-3">
                <TrendingUp className="w-5 h-5 text-red-500" />
                <h2 className="text-sm font-semibold text-[var(--color-text)]">出货机会</h2>
                <StatusBadge variant="danger">涨幅≥{settings.rise_threshold}%</StatusBadge>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {riseItems.length === 0 ? (
                  <EmptyState
                    title="暂无符合条件的上涨物品"
                    icon={TrendingUp}
                  />
                ) : (
                  riseItems.map((item) => (
                    <FireChangeCard key={item.item_id} item={item} isRising={true} />
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-1 mb-3">
                <TrendingDown className="w-5 h-5 text-green-500" />
                <h2 className="text-sm font-semibold text-[var(--color-text)]">捡漏机会</h2>
                <StatusBadge variant="success">跌幅≥{settings.fall_threshold}%</StatusBadge>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {fallItems.length === 0 ? (
                  <EmptyState
                    title="暂无符合条件的下跌物品"
                    icon={TrendingDown}
                  />
                ) : (
                  fallItems.map((item) => (
                    <FireChangeCard key={item.item_id} item={item} isRising={false} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </PageShell>
  );
}
