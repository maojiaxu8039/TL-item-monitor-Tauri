import type { QueryClient } from "@tanstack/react-query"

export const queryKeys = {
  dashboardSummary: ["dashboard-summary"] as const,
  fireHistory: ["fire-history"] as const,
  fireTrendCurrent: ["fire-trend-current"] as const,
  fireTrendHistory: ["fire-trend-history"] as const,
  seasonSummary: ["season-summary"] as const,
  seasonTrends: ["season-trends"] as const,
  realtimeFireChanges: ["realtime-fire-changes"] as const,
  itemsCompare: ["items-compare"] as const,
  itemsSearch: ["items-search"] as const,
  sections: ["sections"] as const,
  sectionItems: ["section-items"] as const,
  allSectionItems: ["all-section-items"] as const,
  itemTypes: ["item-types"] as const,
  arbitrageRecipes: ["arbitrage-recipes"] as const,
  arbitrageCalculation: ["arbitrage-calculation"] as const,
  strategies: ["strategies"] as const,
  alertEvents: ["alert-events"] as const,
  alertRules: ["alert-rules"] as const,
  backupInfo: ["backup-info"] as const,
  config: ["config"] as const,
  dbStats: ["db-stats"] as const,
  itemPriceInsights: ["item-price-insights"] as const,
  marketContext: ["market-context"] as const,
  miniWindowFeed: ["mini-window-feed"] as const,
  seasons: ["seasons"] as const,
  serverStatus: ["server-status"] as const,
  itemTrend: {
    seasons: ["seasons-for-trend"] as const,
    currentDay: (itemId: string, seasonId: string, day: number) => ["item-trend-current-day", itemId, seasonId, day] as const,
    historyDay: (itemId: string, seasonId: string, day: number) => ["item-trend-history-day", itemId, seasonId, day] as const,
    currentSeason: (itemId: string, seasonId: string) => ["item-trend-current-season", itemId, seasonId] as const,
    historySeason: (itemId: string, seasonId: string) => ["item-trend-history-season", itemId, seasonId] as const,
  },
  inventory: {
    positionsBase: ["inventory-positions"] as const,
    buyWatchesBase: ["inventory-buy-watches"] as const,
    summaryBase: ["inventory-summary"] as const,
    itemSearch: (itemName: string) => ["item-search", itemName] as const,
    buyWatchSearch: (itemName: string) => ["item-search-watch", itemName] as const,
    positions: (seasonId: string, marketMode: string) => ["inventory-positions", seasonId, marketMode] as const,
    buyWatches: (seasonId: string, marketMode: string) => ["inventory-buy-watches", seasonId, marketMode] as const,
    summary: (seasonId: string, marketMode: string) => ["inventory-summary", seasonId, marketMode] as const,
  },
}

export function invalidateFireData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.fireHistory })
  queryClient.invalidateQueries({ queryKey: queryKeys.fireTrendCurrent })
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary })
  queryClient.invalidateQueries({ queryKey: queryKeys.seasonSummary })
  queryClient.invalidateQueries({ queryKey: queryKeys.seasonTrends })
  queryClient.invalidateQueries({ queryKey: queryKeys.realtimeFireChanges })
  queryClient.invalidateQueries({ queryKey: queryKeys.itemsCompare })
}

export function invalidateItemsData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.itemsSearch })
  queryClient.invalidateQueries({ queryKey: queryKeys.sections })
  queryClient.invalidateQueries({ queryKey: queryKeys.sectionItems })
  queryClient.invalidateQueries({ queryKey: queryKeys.allSectionItems })
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary })
  queryClient.invalidateQueries({ queryKey: queryKeys.itemTypes })
  queryClient.invalidateQueries({ queryKey: queryKeys.realtimeFireChanges })
  queryClient.invalidateQueries({ queryKey: queryKeys.itemsCompare })
  queryClient.invalidateQueries({ queryKey: queryKeys.arbitrageRecipes })
  queryClient.invalidateQueries({ queryKey: queryKeys.arbitrageCalculation })
  invalidateInventoryData(queryClient)
  queryClient.invalidateQueries({ queryKey: queryKeys.miniWindowFeed })
}

export function invalidateMarketContextData(queryClient: QueryClient) {
  invalidateFireData(queryClient)
  invalidateItemsData(queryClient)
  queryClient.invalidateQueries({ queryKey: queryKeys.strategies })
}

export function invalidateSectionData(
  queryClient: QueryClient,
  context?: { seasonId: string; marketMode: string }
) {
  if (context) {
    queryClient.invalidateQueries({ queryKey: [...queryKeys.sections, context.seasonId, context.marketMode] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.sectionItems, context.seasonId, context.marketMode] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.allSectionItems, context.seasonId, context.marketMode] })
    return
  }

  queryClient.invalidateQueries({ queryKey: queryKeys.sections })
  queryClient.invalidateQueries({ queryKey: queryKeys.sectionItems })
  queryClient.invalidateQueries({ queryKey: queryKeys.allSectionItems })
}

export function invalidateInventoryData(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.positionsBase })
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.buyWatchesBase })
  queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summaryBase })
}
