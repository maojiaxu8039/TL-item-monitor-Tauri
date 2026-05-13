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
  deals: "/torchscan/icons/deals.svg",
  arbitrage: "/torchscan/icons/arbitrage.svg",
  "ai-analysis": "/torchscan/icons/ai-analysis.svg",
  "data-monitor": "/torchscan/icons/data-monitor.svg",
  "import-export": "/torchscan/icons/import-export.svg",
  help: "/torchscan/icons/help.svg",
  strategies: "/torchscan/icons/strategies.svg",
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
      className={cn("h-5 w-5 select-none object-contain", className)}
      draggable={false}
    />
  )
}
