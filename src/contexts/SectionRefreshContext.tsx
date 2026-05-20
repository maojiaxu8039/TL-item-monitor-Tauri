import { createContext, useContext, useCallback, useEffect, useState, useRef, type ReactNode } from "react"
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
  marketContextReady: boolean
  setMarketContext: (ctx: MarketContext) => void
}

const SectionRefreshContext = createContext<SectionRefreshContextType>({
  refreshSections: () => {},
  refreshTrigger: 0,
  refreshData: () => {},
  dataRefreshTrigger: 0,
  marketContext: { seasonId: "ss12", marketMode: "season_normal" },
  marketContextReady: false,
  setMarketContext: () => {},
})

export function SectionRefreshProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [dataRefreshTrigger, setDataRefreshTrigger] = useState(0)
  const [marketContext, setMarketContextState] = useState<MarketContext>({
    seasonId: "ss12",
    marketMode: "season_normal",
  })
  const [marketContextReady, setMarketContextReady] = useState(false)
  const marketContextRef = useRef(marketContext)

  useEffect(() => {
    marketContextRef.current = marketContext
  }, [marketContext])

  useEffect(() => {
    let mounted = true
    cmd.getConfig().then((cfg) => {
      if (!mounted) return
      setMarketContextState({
        seasonId: cfg.app.season_id || "ss12",
        marketMode: cfg.scrape.fire_price_mode || "season_normal",
      })
      setMarketContextReady(true)
    }).catch(() => {
      if (!mounted) return
      setMarketContextReady(true)
    })
    return () => { mounted = false }
  }, [])

  const setMarketContext = useCallback((ctx: MarketContext) => {
    setMarketContextState(ctx)
  }, [])

  const refreshSections = useCallback(() => {
    const ctx = marketContextRef.current
    queryClient.invalidateQueries({ queryKey: ["sections", ctx.seasonId, ctx.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["section-items", ctx.seasonId, ctx.marketMode] })
  }, [queryClient])

  const refreshData = useCallback(() => {
    const ctx = marketContextRef.current
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary", ctx.seasonId, ctx.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["sections", ctx.seasonId, ctx.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["section-items", ctx.seasonId, ctx.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["items-search", ctx.seasonId, ctx.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["fire-history", ctx.seasonId, ctx.marketMode] })
    queryClient.invalidateQueries({ queryKey: ["arbitrage-recipes"] })
    queryClient.invalidateQueries({ queryKey: ["arbitrage-calculation"] })
  }, [queryClient])

  return (
    <SectionRefreshContext.Provider value={{ refreshSections, refreshTrigger: 0, refreshData, dataRefreshTrigger, marketContext, marketContextReady, setMarketContext }}>
      {children}
    </SectionRefreshContext.Provider>
  )
}

export function useSectionRefresh() {
  return useContext(SectionRefreshContext)
}