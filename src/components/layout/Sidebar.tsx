import { motion } from "framer-motion"
import { AssetIcon, type IconAssetName } from "@/components/brand/AssetIcon"
import { cn } from "@/lib/utils"
import type { PageId } from "@/lib/commands"

type NavItem = {
  id: PageId
  label: string
  icon: IconAssetName
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "市场监控", icon: "market-monitor" },
  { id: "items", label: "物品追踪", icon: "item-tracking" },
  { id: "priceanalysis", label: "价格分析", icon: "price-analysis" },
  { id: "deals", label: "捡漏出货", icon: "deals" },
  { id: "alerts", label: "提醒设置", icon: "alerts" },
  { id: "firecompare", label: "火价分析", icon: "fire-price" },
  { id: "arbitrage", label: "套利比价", icon: "arbitrage" },
  { id: "strategies", label: "策略管理", icon: "strategies" },
  { id: "aianalysis", label: "AI分析", icon: "ai-analysis" },
  { id: "records", label: "数据监控", icon: "data-monitor" },
  { id: "import_export", label: "导入导出", icon: "import-export" },
  { id: "settings", label: "设置", icon: "settings" },
  { id: "help", label: "帮助", icon: "help" },
]

export function Sidebar({ page, onPageChange }: { page: PageId; onPageChange: (p: PageId) => void }) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35 }}
      className="torch-sidebar"
    >
      <div className="torch-sidebar-header">
        <span className="text-[11px] font-semibold uppercase text-[var(--color-text-subtle)]">功能列表</span>
        <span className="h-px flex-1 bg-[linear-gradient(90deg,rgba(255,184,0,0.35),transparent)]" />
      </div>

      <nav className="torch-sidebar-nav" aria-label="功能列表">
        {NAV_ITEMS.map(({ id, label, icon }, index) => {
          const isActive = page === id
          return (
            <motion.button
              key={id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: 0.025 * index }}
              onClick={() => onPageChange(id)}
              className={cn("torch-sidebar-item", isActive && "torch-sidebar-item-active")}
              title={label}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active-glow"
                  className="torch-sidebar-active-glow"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="torch-sidebar-icon-frame">
                <AssetIcon name={icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="truncate">{label}</span>
            </motion.button>
          )
        })}
      </nav>

      <div className="torch-sidebar-footer">
        <img src="/torchscan/logo-mark.svg" alt="" className="h-8 w-8" draggable={false} />
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-[var(--color-brand-gold)]">TorchScan</div>
          <div className="truncate text-[10px] text-[var(--color-text-subtle)]">实时物价监控</div>
        </div>
      </div>
    </motion.aside>
  )
}
