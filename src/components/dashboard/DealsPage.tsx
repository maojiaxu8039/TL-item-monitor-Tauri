import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Loader2, Settings, Database, RefreshCw, Package } from "lucide-react";
import { toast } from "sonner";
import { cmd, type FirePriceChangeItem } from "@/lib/commands";
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";

interface FireChangeCardProps {
  item: FirePriceChangeItem;
  isRising: boolean;
}

function FireChangeCard({ item, isRising }: FireChangeCardProps) {
  const changeRate = item.change_rate_5m ?? item.change_rate_3h;
  const price5mAgo = item.price_5m_ago;
  
  return (
    <div className={`bg-white rounded-lg border p-3 transition-colors hover:shadow-sm ${
      isRising ? "border-red-100 hover:border-red-200" : "border-green-100 hover:border-green-200"
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Package className={`w-4 h-4 ${isRising ? "text-red-500" : "text-green-500"}`} />
          <div>
            <div className="text-sm font-medium text-slate-900">{item.item_name}</div>
            <div className="text-xs text-slate-400">ID: {item.item_id}</div>
          </div>
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded ${
          isRising ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
        }`}>
          {item.trend === "sharp_rise" ? "暴涨" : item.trend === "rise" ? "上涨" : item.trend === "sharp_fall" ? "暴跌" : item.trend === "fall" ? "下跌" : "平稳"}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            当前: <span className="font-medium text-slate-700">{item.current_price.toFixed(2)}</span>
          </div>
          {price5mAgo !== null && price5mAgo !== undefined && (
            <div className="text-xs text-slate-500">
              5m前: <span className="font-medium text-slate-700">{price5mAgo.toFixed(2)}</span>
            </div>
          )}
        </div>
        {changeRate !== null && changeRate !== undefined && (
          <div className={`text-sm font-bold ${isRising ? "text-red-500" : "text-green-500"}`}>
            {changeRate >= 0 ? "+" : ""}{changeRate.toFixed(2)}%
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-3">
          <span>3h: {item.price_3h_ago?.toFixed(2) || "-"}</span>
          <span>1h: {item.price_1h_ago?.toFixed(2) || "-"}</span>
          <span>30m: {item.price_30m_ago?.toFixed(2) || "-"}</span>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-800">监控设置</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        
        <div className="p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-slate-700">出货阈值</span>
              </div>
              <span className="text-sm font-medium text-red-600">{riseThreshold}%</span>
            </div>
            <div className="pl-6">
              <div className="text-xs text-slate-500 mb-1.5">涨幅超过此百分比时显示为出货机会</div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={riseThreshold}
                onChange={(e) => setRiseThreshold(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>1%</span>
                <span>50%</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-slate-700">捡漏阈值</span>
              </div>
              <span className="text-sm font-medium text-green-600">{fallThreshold}%</span>
            </div>
            <div className="pl-6">
              <div className="text-xs text-slate-500 mb-1.5">跌幅超过此百分比时显示为捡漏机会</div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={fallThreshold}
                onChange={(e) => setFallThreshold(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>1%</span>
                <span>50%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">取消</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">保存设置</button>
        </div>
      </div>
    </div>
  );
}

export default function DealsPage() {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ rise_threshold: 1, fall_threshold: 1 });
  const { marketContext } = useSectionRefresh();
  const queryClient = useQueryClient();

  useEffect(() => {
    const savedSettings = localStorage.getItem("deals-settings");
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  const { data: fireChanges = [], isLoading, refetch } = useQuery({
    queryKey: ["realtime-fire-changes"],
    queryFn: () => cmd.getRealtimeFireChanges(),
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const seedMutation = useMutation({
    mutationFn: () => cmd.seedRealtimeFireData(),
    onSuccess: (count) => {
      toast.info(`生成了 ${count} 条测试数据`);
      queryClient.invalidateQueries({ queryKey: ["realtime-fire-changes"] });
    },
    onError: (err) => {
      toast.error(`生成失败: ${err}`);
    },
  });

  const handleSaveSettings = (newSettings: { rise_threshold: number; fall_threshold: number }) => {
    setSettings(newSettings);
    localStorage.setItem("deals-settings", JSON.stringify(newSettings));
  };

  const riseItems = fireChanges.filter(item => {
    const rate = item.change_rate_3h;
    return item.trend.includes("rise") && rate !== null && rate !== undefined && rate >= settings.rise_threshold;
  });
  const fallItems = fireChanges.filter(item => {
    const rate = item.change_rate_3h;
    return item.trend.includes("fall") && rate !== null && rate !== undefined && rate <= -settings.fall_threshold;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">捡漏出货</h1>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded">上涨 {riseItems.length}</span>
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">下跌 {fallItems.length}</span>
              <span className="text-slate-400">| 出货≥{settings.rise_threshold}% 捡漏≥{settings.fall_threshold}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {import.meta.env.DEV && (
              <button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                <Database className="w-4 h-4" />
                {seedMutation.isPending ? "生成中..." : "生成测试数据"}
              </button>
            )}
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-sm rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
              设置
            </button>
          </div>
        </div>
      </div>

      {/* Content - Two Columns */}
      <div className="flex-1 overflow-hidden p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
              <span>加载中...</span>
            </div>
          </div>
        ) : fireChanges.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Package className="w-12 h-12 text-slate-200 mb-4" />
            <p className="text-lg font-medium">暂无数据</p>
            {import.meta.env.DEV && (
              <p className="text-sm mt-2">点击"生成测试数据"按钮初始化数据</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 h-full">
            {/* Rise Column */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-1 mb-3">
                <TrendingUp className="w-5 h-5 text-red-500" />
                <h2 className="text-sm font-semibold text-slate-700">出货机会</h2>
                <span className="text-xs text-slate-400">涨幅≥{settings.rise_threshold}%</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {riseItems.length === 0 ? (
                  <div className="bg-slate-50 rounded-lg border border-slate-200 py-12 text-center">
                    <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="text-sm text-slate-400">暂无符合条件的上涨物品</div>
                  </div>
                ) : (
                  riseItems.map((item) => (
                    <FireChangeCard key={item.item_id} item={item} isRising={true} />
                  ))
                )}
              </div>
            </div>

            {/* Fall Column */}
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-1 mb-3">
                <TrendingDown className="w-5 h-5 text-green-500" />
                <h2 className="text-sm font-semibold text-slate-700">捡漏机会</h2>
                <span className="text-xs text-slate-400">跌幅≥{settings.fall_threshold}%</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {fallItems.length === 0 ? (
                  <div className="bg-slate-50 rounded-lg border border-slate-200 py-12 text-center">
                    <TrendingDown className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="text-sm text-slate-400">暂无符合条件的下跌物品</div>
                  </div>
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