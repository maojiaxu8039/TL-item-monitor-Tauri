import { cn } from "@/lib/utils"
import { Flame, LayoutDashboard, Shield, Settings, Download, Box, Bell, Database, CircleHelp, TrendingUp, Brain, Tag, AlertCircle, Calculator } from "lucide-react"
import { motion } from "framer-motion"
import type { PageId } from "@/lib/commands"

const NAV_ITEMS: { id: PageId; label: string; icon: typeof Flame }[] = [
  { id: "dashboard", label: "监控首页", icon: LayoutDashboard },
  { id: "firecompare", label: "火价分析", icon: TrendingUp },
  { id: "items", label: "物价数据", icon: Box },
  { id: "deals", label: "捡漏出货", icon: Tag },
  { id: "strategies", label: "策略管理", icon: Shield },
  { id: "alerts", label: "预警规则", icon: AlertCircle },
  { id: "arbitrage", label: "套利比价", icon: Calculator },
  { id: "priceanalysis", label: "物价分析", icon: Bell },
  { id: "aianalysis", label: "AI分析", icon: Brain },
  { id: "records", label: "数据监控", icon: Database },
  { id: "import_export", label: "导入导出", icon: Download },
  { id: "settings", label: "设置", icon: Settings },
  { id: "help", label: "帮助", icon: CircleHelp },
]

export function Sidebar({ page, onPageChange }: { page: PageId; onPageChange: (p: PageId) => void }) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      className="flex h-full w-[200px] flex-col bg-white border-r border-slate-200/80 shadow-[1px_0_3px_rgba(0,0,0,0.02)]"
    >
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-red-500 shadow-sm">
          <Flame className="h-5 w-5 text-white" />
        </div>
        <span className="text-[15px] font-bold text-slate-800 tracking-tight">火炬之光</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }, index) => {
          const isActive = page === id
          return (
            <motion.button
              key={id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.05 * index }}
              onClick={() => onPageChange(id)}
              className={cn(
                "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all duration-200",
                isActive
                  ? "bg-blue-50 text-blue-600 font-semibold shadow-[0_1px_3px_rgba(59,130,246,0.1)]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-blue-500"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className={cn("h-[18px] w-[18px] flex-shrink-0 transition-colors", isActive ? "text-blue-500" : "text-slate-400")} />
              {label}
            </motion.button>
          )
        })}
      </nav>

      <div className="border-t border-slate-100 px-3 py-3 space-y-0.5">
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-all">
          <svg className="h-[18px] w-[18px] text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          小窗模式
        </button>
      </div>
    </motion.aside>
  )
}
