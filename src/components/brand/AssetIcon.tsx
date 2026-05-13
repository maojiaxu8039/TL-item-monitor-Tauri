import { cn } from "@/lib/utils"

export const iconAssetMap = {
  "market-monitor": "/torchscan/icons/original/market-monitor.png",
  "item-tracking": "/torchscan/icons/original/item-tracking.png",
  "price-analysis": "/torchscan/icons/original/price-analysis.png",
  favorites: "/torchscan/icons/original/favorites.png",
  alerts: "/torchscan/icons/original/alerts.png",
  "more-tools": "/torchscan/icons/original/more-tools.png",
  settings: "/torchscan/icons/original/settings.png",
  "window-minimize": "/torchscan/icons/original/window-minimize.png",
  "window-maximize": "/torchscan/icons/original/window-maximize.png",
  "window-close": "/torchscan/icons/original/window-close.png",
  deals: "/torchscan/icons/original/deals.png",
  arbitrage: "/torchscan/icons/original/arbitrage.png",
  "ai-analysis": "/torchscan/icons/original/ai-analysis.png",
  "data-monitor": "/torchscan/icons/original/data-monitor.png",
  "import-export": "/torchscan/icons/original/import-export.png",
  help: "/torchscan/icons/original/help.png",
  strategies: "/torchscan/icons/original/strategies.png",
  "fire-price": "/torchscan/icons/original/fire-price.png",
} as const

export type IconAssetName = keyof typeof iconAssetMap

interface AssetIconProps {
  name: IconAssetName
  className?: string
  label?: string
}

export function AssetIcon({ name, className, label }: AssetIconProps) {
  return (
    <img
      src={iconAssetMap[name]}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={cn("torch-asset-icon h-5 w-5 select-none object-contain", className)}
      draggable={false}
    />
  )
}
