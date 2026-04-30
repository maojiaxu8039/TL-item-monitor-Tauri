import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { motion } from "framer-motion"
import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { cmd } from "@/lib/commands"
import { useSectionRefresh } from "@/contexts/SectionRefreshContext"

export function TopBar() {
  const { refreshData, marketContext, setMarketContext } = useSectionRefresh()
  const [marketMode, setMarketMode] = useState(marketContext.marketMode)

  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary", marketContext.seasonId, marketContext.marketMode],
    queryFn: () => cmd.getDashboardSummary(),
  })

  const switchModeMutation = useMutation({
    mutationFn: async (newMode: string) => {
      const seasonId = summary?.season_name || "ss12"
      await cmd.setActiveMarketContext(seasonId, newMode)
    },
    onSuccess: () => {
      const season_id = summary?.season_name || "ss12"
      setMarketContext({ seasonId: season_id, marketMode })
      toast.success("已切换到" + (marketMode === "season_normal" ? "赛季普通" : "赛季专家"))
      refreshData()
    },
    onError: (error) => {
      toast.error(`切换失败: ${error}`)
    },
  })

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value
    setMarketMode(newMode)
    switchModeMutation.mutate(newMode)
  }

  const handleRefresh = () => {
    refreshData()
    toast.success("数据已刷新")
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-[56px] items-center gap-5 border-b border-slate-200/80 bg-white/80 backdrop-blur-sm px-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-slate-500 font-medium">赛季模式</span>
        <Select
          className="h-8 w-[110px] text-[13px] bg-slate-50 border-slate-200 rounded-lg"
          value={marketMode}
          onChange={handleModeChange}
          disabled={switchModeMutation.isPending}
        >
          <option value="season_normal">赛季普通</option>
          <option value="season_expert">赛季专家</option>
        </Select>
        {switchModeMutation.isPending && (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
        )}
      </div>

      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-slate-500 font-medium">当前火价</span>
        <span className="font-bold text-red-500 text-base">
          {summary?.fire?.rmb_per_10k_fire?.toFixed(2) || "—"}
        </span>
        <span className="text-slate-400">元/万火</span>
        {summary?.fire?.increase_ratio !== null && summary?.fire?.increase_ratio !== undefined && (
          <span className={`text-xs font-medium ${summary.fire.increase_ratio >= 0 ? "text-green-500" : "text-red-500"}`}>
            {summary.fire.increase_ratio >= 0 ? "↑" : "↓"}{Math.abs(summary.fire.increase_ratio).toFixed(2)}%
          </span>
        )}
      </div>

      <div className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        className="gap-1.5 text-[13px] h-8 px-4 border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all rounded-lg"
      >
        <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
        刷新数据
      </Button>
    </motion.header>
  )
}
