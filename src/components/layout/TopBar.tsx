import { useEffect, useState, useRef, memo, type ChangeEvent, type MouseEvent } from "react"
import { RefreshCw, Minimize2, Maximize2 } from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { motion } from "framer-motion"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AssetIcon } from "@/components/brand/AssetIcon"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { cmd, type PageId } from "@/lib/commands"
import { publicAssetPath } from "@/lib/icons"
import { invalidateMarketContextData, queryKeys } from "@/lib/queryKeys"
import { cn } from "@/lib/utils"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext";
import { errorMessage } from "@/lib/utils";
import { useVisiblePolling } from "@/hooks/useVisiblePolling";

const FireStaleTag = memo(function FireStaleTag({ scrapedAt }: { scrapedAt: number }) {
  const isStale = Date.now() / 1000 - scrapedAt > 3600;
  if (!isStale) return null;
  return (
    <span className="ml-1 rounded bg-[rgba(239,68,68,0.15)] px-1 py-0 text-[10px] font-medium text-[var(--color-danger)]" title={`数据已过期 (${new Date(scrapedAt * 1000).toLocaleString('zh-CN')})，点击刷新获取最新`}>
      缓存
    </span>
  );
});

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: "市场监控",
  firecompare: "火价分析",
  items: "物品追踪",
  deals: "捡漏出货",
  records: "数据监控",
  strategies: "策略管理",
  priceanalysis: "价格分析",
  aianalysis: "AI分析",
  import_export: "导入导出",
  settings: "设置",
  help: "帮助",
  alerts: "提醒设置",
  arbitrage: "套利比价",
  inventory: "囤货出货",
}

interface TopBarProps {
  page: PageId
  onPageChange: (page: PageId) => void
  isMiniMode?: boolean
  setIsMiniMode?: (value: boolean) => void
}

async function withWindow(action: "minimize" | "toggleMaximize" | "close") {
  try {
    const appWindow = getCurrentWindow()
    if (action === "minimize") {
      await appWindow.minimize()
      return
    }
    if (action === "toggleMaximize") {
      if (await appWindow.isMaximized()) {
        await appWindow.unmaximize()
      } else {
        await appWindow.maximize()
      }
      return
    }
    await appWindow.close()
  } catch {
    // Window APIs are only available in the Tauri shell.
  }
}

async function startDrag(e: MouseEvent) {
  if (e.button !== 0) return
  if ((e.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return
  try {
    await getCurrentWindow().startDragging()
  } catch {
    // startDragging is unavailable outside the Tauri shell.
  }
}

function sourceLabel(source: string) {
  switch (source) {
    case "dual":
      return "双源"
    case "etor":
      return "易火"
    case "api":
      return "小助手"
    case "local":
      return "本地"
    default:
      return "数据源"
  }
}

function sourceTitle(source: string) {
  switch (source) {
    case "dual":
      return "双源合并：刷图小助手 + 易火"
    case "etor":
      return "易火 API 数据源"
    case "api":
      return "刷图小助手 API 数据源"
    case "local":
      return "本地 JSON 数据源"
    default:
      return "物品数据源"
  }
}

function sourceDotClass(source: string) {
  switch (source) {
    case "dual":
      return "bg-[var(--color-brand-gold)]"
    case "etor":
      return "bg-[var(--color-ai)]"
    case "api":
      return "bg-[var(--color-success)]"
    case "local":
      return "bg-[var(--color-success)]"
    default:
      return "bg-[var(--color-text-subtle)]"
  }
}

export function TopBar({ page, onPageChange, isMiniMode: externalIsMiniMode, setIsMiniMode: externalSetIsMiniMode }: TopBarProps) {
  const { refreshData, marketContext, marketContextReady, setMarketContext } = useSectionRefresh()
  const queryClient = useQueryClient()
  const [marketMode, setMarketMode] = useState(marketContext.marketMode)
  const [dataSource, setDataSource] = useState("dual")
  const [notificationEnabled, setNotificationEnabled] = useState(true)
  const [internalMiniMode, setInternalMiniMode] = useState(false)
  const isMiniMode = externalIsMiniMode ?? internalMiniMode
  const setIsMiniMode = externalSetIsMiniMode ?? setInternalMiniMode
  const prevModeRef = useRef(marketContext.marketMode)
  const summaryRef = useRef<string | undefined>(undefined)
  const marketContextRef = useRef(marketContext)

  useEffect(() => {
    marketContextRef.current = marketContext
  }, [marketContext])

  useEffect(() => {
    setMarketMode(marketContext.marketMode)
    prevModeRef.current = marketContext.marketMode
  }, [marketContext.marketMode])

  const { data: config } = useQuery({
    queryKey: queryKeys.config,
    queryFn: () => cmd.getConfig(),
    staleTime: 30 * 1000,
  })

  useEffect(() => {
    if (!config) return
    setDataSource(config.scrape.items_source || "dual")
    setNotificationEnabled(config.notification.system_notifications)
    setIsMiniMode(config.desktop.mini_mode)
  }, [config, setIsMiniMode])

  const summaryRefetchInterval = useVisiblePolling(120000)

  const { data: summary } = useQuery({
    queryKey: [...queryKeys.dashboardSummary, marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getDashboardSummary(),
    enabled: marketContextReady,
    refetchInterval: summaryRefetchInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    summaryRef.current = summary?.season_name
  }, [summary?.season_name])

  const switchModeMutation = useMutation({
    mutationFn: async (newMode: string) => {
      const currentCtx = marketContextRef.current
      const seasonId = summaryRef.current || currentCtx.seasonId || "ss12"
      await cmd.setActiveMarketContext(seasonId, newMode)
      return newMode
    },
    onSuccess: (newMode) => {
      const currentCtx = marketContextRef.current
      setMarketContext({ seasonId: currentCtx.seasonId, marketMode: newMode })
      toast.success("已切换到" + (newMode === "season_normal" ? "赛季普通" : "赛季专家"))
      invalidateMarketContextData(queryClient)
    },
    onError: (error) => {
      setMarketMode(prevModeRef.current)
      toast.error(`切换失败: ${errorMessage(error)}`)
    },
  })

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await cmd.refreshFirePrice()
      await cmd.refreshItems()
    },
    onSuccess: () => {
      refreshData()
      toast.success("已获取最新数据！")
    },
    onError: (error) => {
      toast.error(`获取失败: ${errorMessage(error)}`)
    },
  })

  const [miniModeLoading, setMiniModeLoading] = useState(false)

  const handleToggleMiniMode = async () => {
    if (miniModeLoading) return
    setMiniModeLoading(true)
    try {
      const newMode = !isMiniMode
      await cmd.setMiniWindowMode(newMode)
      setIsMiniMode(newMode)
      toast.success(newMode ? "已切换到小窗口模式" : "已切换到主窗口模式")
    } catch (error) {
      toast.error(`切换失败: ${errorMessage(error)}`)
    } finally {
      setMiniModeLoading(false)
    }
  }

  const handleModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value
    prevModeRef.current = marketMode
    setMarketMode(newMode)
    switchModeMutation.mutate(newMode)
  }

  if (isMiniMode) {
    return (
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="torch-topbar"
        data-tauri-drag-region
        onMouseDown={startDrag}
      >
        <div className="torch-topbar-drag-region" data-tauri-drag-region />
        <button
          className="relative z-[1] flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left"
          onClick={() => onPageChange("dashboard")}
          title="TorchScan 小窗口"
        >
          <img src={publicAssetPath("torchscan/logo-mark.png")} alt="TorchScan" className="h-7 w-auto" draggable={false} />
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-[var(--color-brand-gold)]">TorchScan 小窗</div>
            <div className="truncate text-[10px] text-[var(--color-text-subtle)]">
              {marketMode === "season_expert" ? "赛季专家" : "赛季普通"}
              {summary?.fire?.rmb_per_10k_fire ? ` · ${summary.fire.rmb_per_10k_fire.toFixed(2)}元/万火` : ""}
            </div>
          </div>
        </button>

        <div className="relative z-[1] flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="torch-icon-button h-8 w-8"
            title="刷新数据"
          >
            <RefreshCw className={cn("h-4 w-4", refreshMutation.isPending && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleMiniMode}
            disabled={miniModeLoading}
            className="torch-icon-button h-8 w-8 bg-[var(--color-brand-gold)]/20"
            title="恢复主窗口"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <button className="torch-window-button" onClick={() => withWindow("minimize")} title="最小化">
            <AssetIcon name="window-minimize" className="h-[18px] w-[18px]" />
          </button>
          <button className="torch-window-button torch-window-close" onClick={() => withWindow("close")} title="关闭">
            <AssetIcon name="window-close" className="h-[18px] w-[18px]" />
          </button>
        </div>
      </motion.header>
    )
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="torch-topbar"
      data-tauri-drag-region
      onMouseDown={startDrag}
    >
      <div className="torch-topbar-drag-region" data-tauri-drag-region />
      <button className="torch-brand" onClick={() => onPageChange("dashboard")} title="TorchScan">
        <img src={publicAssetPath("torchscan/logo-mark.png")} alt="TorchScan" className="torch-brand-logo" draggable={false} />
      </button>

      <div className="torch-topbar-context">
        <span>{PAGE_TITLES[page]}</span>
      </div>

      <div className="flex-1" />

      <div className="torch-market-strip">
        <Select
          className="torch-select h-8 w-[108px] text-[12px]"
          value={marketMode}
          onChange={handleModeChange}
          title="赛季模式"
        >
          <option value="season_normal">赛季普通</option>
          <option value="season_expert">赛季专家</option>
        </Select>

        <div className="torch-price-chip" title="当前火价">
          <AssetIcon name="fire-price" className="h-5 w-5" />
          <span className="font-bold text-[var(--color-brand-gold)]">
            {summary?.fire?.rmb_per_10k_fire?.toFixed(2) || "—"}
          </span>
          <span className="text-[var(--color-text-subtle)]">元/万火</span>
          {summary?.fire && (
            <FireStaleTag scrapedAt={summary.fire.scraped_at} />
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="torch-icon-button h-8 w-8"
          title="获取最新数据"
        >
          <RefreshCw className={cn("h-4 w-4", refreshMutation.isPending && "animate-spin")} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggleMiniMode}
          disabled={miniModeLoading}
          className={cn("torch-icon-button h-8 w-8", isMiniMode && "bg-[var(--color-brand-gold)]/20")}
          title={isMiniMode ? "切换到主窗口" : "切换到小窗口"}
        >
          {isMiniMode ? (
            <Maximize2 className="h-4 w-4" />
          ) : (
            <Minimize2 className="h-4 w-4" />
          )}
        </Button>

        <div className="torch-status-chip" title={sourceTitle(dataSource)}>
          <span className={cn("torch-status-dot", sourceDotClass(dataSource))} />
          {sourceLabel(dataSource)}
        </div>

        <div className="torch-status-chip" title={notificationEnabled ? "通知已开启" : "通知已关闭"}>
          <span className={cn("torch-status-dot", notificationEnabled ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]")} />
          通知
        </div>
      </div>

      <div className="torch-window-controls">
        <button className={cn("torch-window-button", page === "settings" && "torch-window-button-active")} onClick={() => onPageChange("settings")} title="设置">
          <AssetIcon name="settings" className="h-5 w-5" />
        </button>
        <button className="torch-window-button" onClick={() => withWindow("minimize")} title="最小化">
          <AssetIcon name="window-minimize" className="h-[18px] w-[18px]" />
        </button>
        <button className="torch-window-button" onClick={() => withWindow("toggleMaximize")} title="最大化">
          <AssetIcon name="window-maximize" className="h-[18px] w-[18px]" />
        </button>
        <button className="torch-window-button torch-window-close" onClick={() => withWindow("close")} title="关闭">
          <AssetIcon name="window-close" className="h-[18px] w-[18px]" />
        </button>
      </div>
    </motion.header>
  )
}
