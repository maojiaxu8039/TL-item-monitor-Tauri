import { motion } from "framer-motion"
import { AssetIcon } from "@/components/brand/AssetIcon"
import { publicAssetPath, type IconAssetName } from "@/lib/icons"
import { cn } from "@/lib/utils"
import type { PageId } from "@/lib/commands"

type NavItem = {
  id: PageId
  label: string
  icon: IconAssetName
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "行情与交易",
    items: [
      { id: "dashboard", label: "市场监控", icon: "market-monitor" },
      { id: "arbitrage", label: "套利比价", icon: "arbitrage" },
      { id: "inventory", label: "囤货出货", icon: "data-monitor" },
      { id: "deals", label: "捡漏出货", icon: "deals" },
      { id: "items", label: "物品追踪", icon: "item-tracking" },
    ],
  },
  {
    label: "分析与策略",
    items: [
      { id: "firecompare", label: "火价分析", icon: "fire-price" },
      { id: "strategies", label: "策略管理", icon: "strategies" },
      { id: "aianalysis", label: "AI分析", icon: "ai-analysis" },
    ],
  },
  {
    label: "数据与通知",
    items: [
      { id: "alerts", label: "提醒设置", icon: "alerts" },
      { id: "records", label: "数据监控", icon: "data-monitor" },
      { id: "import_export", label: "导入导出", icon: "import-export" },
    ],
  },
]

const UTILITY_ITEMS: NavItem[] = [
  { id: "settings", label: "设置", icon: "settings" },
  { id: "help", label: "帮助", icon: "help" },
]

function SidebarItem({ item, page, onPageChange, index }: { item: NavItem; page: PageId; onPageChange: (p: PageId) => void; index: number }) {
  const { id, label, icon } = item
  const isActive = page === id
  return (
    <motion.button
      key={id}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: 0.02 * index }}
      onClick={() => onPageChange(id)}
      className={cn("torch-sidebar-item", isActive && "torch-sidebar-item-active")}
      title={label}
      aria-current={isActive ? "page" : undefined}
    >
      {isActive && <motion.span layoutId="sidebar-active-glow" className="torch-sidebar-active-glow" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
      <span className="torch-sidebar-icon-frame"><AssetIcon name={icon} className="h-6 w-6" /></span>
      <span className="truncate">{label}</span>
    </motion.button>
  )
}

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
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className="torch-sidebar-group" aria-label={group.label}>
            <div className="torch-sidebar-group-label">{group.label}</div>
            {group.items.map((item, itemIndex) => (
              <SidebarItem key={item.id} item={item} page={page} onPageChange={onPageChange} index={groupIndex * 5 + itemIndex} />
            ))}
          </div>
        ))}
      </nav>

      <div className="torch-sidebar-utility" aria-label="系统功能">
        {UTILITY_ITEMS.map((item, index) => (
          <SidebarItem key={item.id} item={item} page={page} onPageChange={onPageChange} index={index} />
        ))}
      </div>

      <div className="torch-sidebar-footer">
        <img src={publicAssetPath("torchscan/logo-mark.png")} alt="TorchScan" className="torch-sidebar-footer-logo" draggable={false} />
        <img src={publicAssetPath("torchscan/app-icon-64.png")} alt="TorchScan" className="torch-sidebar-footer-emblem" draggable={false} />
      </div>
    </motion.aside>
  )
}
