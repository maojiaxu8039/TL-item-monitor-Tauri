export function publicAssetPath(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`
}

export const iconAssetMap = {
  "market-monitor": publicAssetPath("torchscan/icons/original/market-monitor.png"),
  "item-tracking": publicAssetPath("torchscan/icons/original/item-tracking.png"),
  alerts: publicAssetPath("torchscan/icons/original/alerts.png"),
  settings: publicAssetPath("torchscan/icons/original/settings.png"),
  "window-minimize": publicAssetPath("torchscan/icons/original/window-minimize.png"),
  "window-maximize": publicAssetPath("torchscan/icons/original/window-maximize.png"),
  "window-close": publicAssetPath("torchscan/icons/original/window-close.png"),
  deals: publicAssetPath("torchscan/icons/original/deals.png"),
  arbitrage: publicAssetPath("torchscan/icons/original/arbitrage.png"),
  "ai-analysis": publicAssetPath("torchscan/icons/original/ai-analysis.png"),
  "data-monitor": publicAssetPath("torchscan/icons/original/data-monitor.png"),
  "import-export": publicAssetPath("torchscan/icons/original/import-export.png"),
  help: publicAssetPath("torchscan/icons/original/help.png"),
  strategies: publicAssetPath("torchscan/icons/original/strategies.png"),
  "fire-price": publicAssetPath("torchscan/icons/original/fire-price.png"),
} as const

export type IconAssetName = keyof typeof iconAssetMap
