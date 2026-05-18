import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { cmd } from "@/lib/commands"

interface MarketContext {
  seasonId: string
  marketMode: string
}

interface SectionRefreshContextType {
  refreshSections: () => void
  refreshTrigger: number
  refreshData: () => void
  dataRefreshTrigger: number
  marketContext: MarketContext
  setMarketContext: (ctx: MarketContext) => void
}

const SectionRefreshContext = createContext<SectionRefreshContextType>({
  refreshSections: () => {},
  refreshTrigger: 0,
  refreshData: () => {},
  dataRefreshTrigger: 0,
  marketContext: { seasonId: "ss12", marketMode: "season_normal" },
  setMarketContext: () => {},
})

export function SectionRefreshProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [dataRefreshTrigger, setDataRefreshTrigger] = useState(0)
  const [marketContext, setMarketContextState] = useState<MarketContext>({
    seasonId: "ss12",
    marketMode: "season_normal",
  })

  // 启动时从后端同步市场上下文
  useEffect(() => {
    let mounted = true
    cmd.getConfig().then((cfg) => {
      if (!mounted) return
      setMarketContextState({
        seasonId: cfg.app.season_id || "ss12",
        marketMode: cfg.scrape.fire_price_mode || "season_normal",
      })
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  const setMarketContext = useCallback((ctx: MarketContext) => {
    setMarketContextState(ctx)
  }, [])

  const refreshSections = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sections", marketContext.seasonId, marketContext.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["section-items", marketContext.seasonId, marketContext.marketMode] })
    setRefreshTrigger(prev => prev + 1)
  }, [queryClient, marketContext.seasonId, marketContext.marketMode])

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary", marketContext.seasonId, marketContext.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["sections", marketContext.seasonId, marketContext.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["section-items", marketContext.seasonId, marketContext.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["items-search", marketContext.seasonId, marketContext.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["fire-history", marketContext.seasonId, marketContext.marketMode] })
    setDataRefreshTrigger(prev => prev + 1)
  }, [queryClient, marketContext.seasonId, marketContext.marketMode])

  return (
    <SectionRefreshContext.Provider value={{ refreshSections, refreshTrigger, refreshData, dataRefreshTrigger, marketContext, setMarketContext }}>
      {children}
    </SectionRefreshContext.Provider>
  )
}

export function useSectionRefresh() {
  return useContext(SectionRefreshContext)
}