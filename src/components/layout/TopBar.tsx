import { useEffect, useState, useRef, memo, type ChangeEvent, type MouseEvent } from "react"
import { RefreshCw } from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { motion } from "framer-motion"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { AssetIcon } from "@/components/brand/AssetIcon"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { cmd, type PageId } from "@/lib/commands"
import { cn } from "@/lib/utils"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"

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
}

interface TopBarProps {
  page: PageId
  onPageChange: (page: PageId) => void
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

export function TopBar({ page, onPageChange }: TopBarProps) {
  const { refreshData, marketContext, marketContextReady, setMarketContext } = useSectionRefresh()
  const queryClient = useQueryClient()
  const [marketMode, setMarketMode] = useState(marketContext.marketMode)
  const [dataSource, setDataSource] = useState<"api" | "local">("api")
  const [notificationEnabled, setNotificationEnabled] = useState(true)
  const prevModeRef = useRef(marketContext.marketMode)
  const summaryRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    setMarketMode(marketContext.marketMode)
    prevModeRef.current = marketContext.marketMode
  }, [marketContext.marketMode])

  useEffect(() => {
    let mounted = true
    cmd.getConfig().then((cfg) => {
      if (!mounted) return
      setDataSource(cfg.scrape.items_source === "local" ? "local" : "api")
      setNotificationEnabled(cfg.notification.system_notifications)
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getDashboardSummary(),
    enabled: marketContextReady,
    refetchInterval: 10000,
  })

  useEffect(() => {
    summaryRef.current = summary?.season_name
  }, [summary?.season_name])

  const switchModeMutation = useMutation({
    mutationFn: async (newMode: string) => {
      const seasonId = summaryRef.current || "ss12"
      await cmd.setActiveMarketContext(seasonId, newMode)
      return newMode
    },
    onSuccess: (newMode) => {
      const seasonId = summaryRef.current || "ss12"
      setMarketContext({ seasonId, marketMode: newMode })
      toast.success("已切换到" + (newMode === "season_normal" ? "赛季普通" : "赛季专家"))
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] })
      queryClient.invalidateQueries({ queryKey: ["fire-history"] })
      queryClient.invalidateQueries({ queryKey: ["sections"] })
      queryClient.invalidateQueries({ queryKey: ["section-items"] })
      queryClient.invalidateQueries({ queryKey: ["items-search"] })
      queryClient.invalidateQueries({ queryKey: ["arbitrage-recipes"] })
      queryClient.invalidateQueries({ queryKey: ["arbitrage-calculation"] })
    },
    onError: (error, newMode) => {
      setMarketMode(prevModeRef.current)
      toast.error(`切换失败: ${error}`)
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
      toast.error(`获取失败: ${error}`)
    },
  })

  const handleModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value
    prevModeRef.current = marketMode
    setMarketMode(newMode)
    switchModeMutation.mutate(newMode)
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
        <img src="/torchscan/logo-mark.png" alt="TorchScan" className="torch-brand-logo" draggable={false} />
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

        <div className="torch-status-chip" title={dataSource === "api" ? "网络数据源" : "本地数据源"}>
          <span className={cn("torch-status-dot", dataSource === "api" ? "bg-[var(--color-ai)]" : "bg-[var(--color-success)]")} />
          {dataSource === "api" ? "网络" : "本地"}
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
