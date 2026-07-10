import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Loader2, Settings, RefreshCw, Package } from "lucide-react";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Surface } from "@/components/ui/Surface";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ToolbarActions } from "@/components/ui/Toolbar";
import { Button } from "@/components/ui/button";

function formatCompactPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 10000) return `${(value / 1000).toFixed(1)}k`;
  if (abs >= 1000) return value.toFixed(1);
  return value.toFixed(2);
}
import { cmd, type FirePriceChangeItem } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { queryKeys } from "@/lib/queryKeys";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";

interface FireChangeCardProps {
  item: FirePriceChangeItem;
  isRising: boolean;
}

const FireChangeCard = memo(function FireChangeCard({ item, isRising }: FireChangeCardProps) {
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
        isRising ? "border-[rgba(239,68,68,0.2)] hover:border-[rgba(239,68,68,0.35)]" : "border-[rgba(34,197,94,0.2)] hover:border-[rgba(34,197,94,0.35)]"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Package className={`w-4 h-4 ${isRising ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`} />
          <div>
            <div className="text-sm font-medium text-[var(--color-text)]">{item.name}</div>
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
        <div className="text-center p-1.5 bg-[var(--color-panel-soft)] rounded min-w-0 overflow-hidden">
          <div className="text-[var(--color-text-subtle)]">5m</div>
          <div className="font-medium text-[var(--color-text)] tabular-nums truncate">
            {item.price_5m_ago !== null ? formatCompactPrice(item.price_5m_ago) : "-"}
          </div>
          <div className={`text-[10px] tabular-nums truncate ${(item.change_rate_5m ?? 0) >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
            {item.change_rate_5m !== null ? `(${(item.change_rate_5m ?? 0) >= 0 ? "+" : ""}${item.change_rate_5m?.toFixed(1)}%)` : ""}
          </div>
        </div>
        <div className="text-center p-1.5 bg-[var(--color-panel-soft)] rounded min-w-0 overflow-hidden">
          <div className="text-[var(--color-text-subtle)]">30m</div>
          <div className="font-medium text-[var(--color-text)] tabular-nums truncate">
            {item.price_30m_ago !== null ? formatCompactPrice(item.price_30m_ago) : "-"}
          </div>
          <div className={`text-[10px] tabular-nums truncate ${(item.change_rate_30m ?? 0) >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
            {item.change_rate_30m !== null ? `(${(item.change_rate_30m ?? 0) >= 0 ? "+" : ""}${item.change_rate_30m?.toFixed(1)}%)` : ""}
          </div>
        </div>
        <div className="text-center p-1.5 bg-[var(--color-panel-soft)] rounded min-w-0 overflow-hidden">
          <div className="text-[var(--color-text-subtle)]">1h</div>
          <div className="font-medium text-[var(--color-text)] tabular-nums truncate">
            {item.price_1h_ago !== null ? formatCompactPrice(item.price_1h_ago) : "-"}
          </div>
          <div className={`text-[10px] tabular-nums truncate ${(item.change_rate_1h ?? 0) >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
            {item.change_rate_1h !== null ? `(${(item.change_rate_1h ?? 0) >= 0 ? "+" : ""}${item.change_rate_1h?.toFixed(1)}%)` : ""}
          </div>
        </div>
        <div className="text-center p-1.5 bg-[var(--color-panel-soft)] rounded min-w-0 overflow-hidden">
          <div className="text-[var(--color-text-subtle)]">3h</div>
          <div className="font-medium text-[var(--color-text)] tabular-nums truncate">
            {item.price_3h_ago !== null ? formatCompactPrice(item.price_3h_ago) : "-"}
          </div>
          <div className={`text-[10px] tabular-nums truncate ${(item.change_rate_3h ?? 0) >= 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
            {item.change_rate_3h !== null ? `(${(item.change_rate_3h ?? 0) >= 0 ? "+" : ""}${item.change_rate_3h?.toFixed(1)}%)` : ""}
          </div>
        </div>
      </div>
    </Surface>
  );
});

interface SettingsModalProps {
  settings: { rise_threshold: number; fall_threshold: number; max_price: number };
  onSave: (settings: { rise_threshold: number; fall_threshold: number; max_price: number }) => void;
  onClose: () => void;
}

function SettingsModal({ settings, onSave, onClose }: SettingsModalProps) {
  const [riseThreshold, setRiseThreshold] = useState(settings.rise_threshold);
  const [fallThreshold, setFallThreshold] = useState(settings.fall_threshold);
  const [maxPrice, setMaxPrice] = useState(settings.max_price);

  const handleSave = () => {
    onSave({ rise_threshold: riseThreshold, fall_threshold: fallThreshold, max_price: maxPrice });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-[480px] overflow-hidden rounded-2xl bg-[var(--color-panel)] shadow-2xl">
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
                <TrendingUp className="w-4 h-4 text-[var(--color-danger)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">出货阈值</span>
              </div>
              <span className="text-sm font-medium text-[var(--color-danger)]">{riseThreshold}%</span>
            </div>
            <div className="pl-6">
              <div className="text-xs text-[var(--color-text-subtle)] mb-1.5">涨幅超过此百分比时显示为出货机会</div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={riseThreshold}
                onChange={(e) => setRiseThreshold(Number(e.target.value) || 0)}
                className="w-full h-1.5 bg-[var(--color-panel-soft)] rounded-lg appearance-none cursor-pointer accent-[var(--color-danger)]"
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
                <TrendingDown className="w-4 h-4 text-[var(--color-success)]" />
                <span className="text-sm font-medium text-[var(--color-text)]">捡漏阈值</span>
              </div>
              <span className="text-sm font-medium text-[var(--color-success)]">{fallThreshold}%</span>
            </div>
            <div className="pl-6">
              <div className="text-xs text-[var(--color-text-subtle)] mb-1.5">跌幅超过此百分比时显示为捡漏机会</div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={fallThreshold}
                onChange={(e) => setFallThreshold(Number(e.target.value) || 0)}
                className="w-full h-1.5 bg-[var(--color-panel-soft)] rounded-lg appearance-none cursor-pointer accent-[var(--color-success)]"
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
                <span className="text-sm font-medium text-[var(--color-text)]">物品火价下限</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Math.max(0, Number(e.target.value) || 0))}
                  className="w-20 px-2 py-1 text-sm text-center bg-[var(--color-panel-soft)] border border-[var(--color-border-soft)] rounded-lg text-[var(--color-brand)] focus:outline-none focus:border-[var(--color-brand)]"
                />
                <span className="text-sm text-[var(--color-text-subtle)]">火</span>
              </div>
            </div>
            <div className="pl-6">
              <div className="text-xs text-[var(--color-text-subtle)] mb-1.5">只显示单价不低于此火价的物品（0 为不限）</div>
              <input
                type="range"
                min={0}
                max={2000}
                step={5}
                value={Math.min(maxPrice, 2000)}
                onChange={(e) => setMaxPrice(Number(e.target.value) || 0)}
                className="w-full h-1.5 bg-[var(--color-panel-soft)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
              />
              <div className="flex justify-between text-xs text-[var(--color-text-subtle)] mt-1">
                <span>0 (不限)</span>
                <span>2000+</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--color-border-soft)]">
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleSave}>保存设置</Button>
        </div>
      </div>
    </div>
  );
}

export default function DealsPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<{ rise_threshold: number; fall_threshold: number; max_price: number }>({ rise_threshold: 5, fall_threshold: 5, max_price: 0 });
  const { marketContext, marketContextReady } = useSectionRefresh();
  const fireChangesRefetchInterval = useVisiblePolling(120000);

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem("deals-settings");
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch {
      // ignore corrupted localStorage data
    }
  }, []);

  const { data: fireChanges = [], isLoading, refetch } = useQuery({
    queryKey: [...queryKeys.realtimeFireChanges, marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getRealtimeFireChanges(marketContext.seasonId, marketContext.marketMode),
    enabled: marketContextReady,
    refetchInterval: fireChangesRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const handleSaveSettings = useCallback((newSettings: { rise_threshold: number; fall_threshold: number; max_price: number }) => {
    setSettings(newSettings);
    localStorage.setItem("deals-settings", JSON.stringify(newSettings));
  }, []);

  const maxAbsChange = (item: FirePriceChangeItem) =>
    Math.max(
      Math.abs(item.change_rate_3h ?? 0),
      Math.abs(item.change_rate_1h ?? 0),
      Math.abs(item.change_rate_30m ?? 0),
      Math.abs(item.change_rate_5m ?? 0)
    );

  const riseItems = useMemo(() => fireChanges.filter(item => {
    if (!item.trend.includes("rise")) return false;
    if (settings.max_price > 0 && (item.current_price ?? 0) < settings.max_price) return false;
    return maxAbsChange(item) >= settings.rise_threshold;
  }).sort((a, b) => {
    const diff = maxAbsChange(b) - maxAbsChange(a);
    return Math.abs(diff) < 1e-9 ? a.item_id.localeCompare(b.item_id) : diff;
  }), [fireChanges, settings.rise_threshold, settings.max_price]);

  const fallItems = useMemo(() => fireChanges.filter(item => {
    if (!item.trend.includes("fall")) return false;
    if (settings.max_price > 0 && (item.current_price ?? 0) < settings.max_price) return false;
    return maxAbsChange(item) >= settings.fall_threshold;
  }).sort((a, b) => {
    const diff = maxAbsChange(b) - maxAbsChange(a);
    return Math.abs(diff) < 1e-9 ? a.item_id.localeCompare(b.item_id) : diff;
  }), [fireChanges, settings.fall_threshold, settings.max_price]);

  return (
    <PageShell size="xl" className="h-full flex flex-col">
      <PageHeader
        title="捡漏出货"
        description={`实时监控物品价格变化，自动检测涨跌机会 | 出货≥${settings.rise_threshold}% 捡漏≥${settings.fall_threshold}%`}
        iconAsset="deals"
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
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-text-subtle)]" />
              <span className="text-[var(--color-text-subtle)]">加载中...</span>
            </div>
          </div>
        ) : fireChanges.length === 0 ? (
          <EmptyState
            title="暂无数据"
            description="已开始采集物品价格，请等待至少两批价格样本后计算涨跌机会"
            icon={Package}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:gap-6 xl:h-full">
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-1 mb-3">
                <TrendingUp className="w-5 h-5 text-[var(--color-danger)]" />
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
                <TrendingDown className="w-5 h-5 text-[var(--color-success)]" />
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
