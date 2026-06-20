import { createContext, useContext, useCallback, useEffect, useState, useRef, useMemo, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { cmd } from "@/lib/commands"
import { invalidateMarketContextData, invalidateSectionData } from "@/lib/queryKeys"

interface MarketContext {
  seasonId: string
  marketMode: string
}

interface SectionRefreshContextType {
  refreshSections: () => void
  refreshTrigger: number
  refreshData: () => void
  marketContext: MarketContext
  marketContextReady: boolean
  setMarketContext: (ctx: MarketContext) => void
}

const SectionRefreshContext = createContext<SectionRefreshContextType>({
  refreshSections: () => {},
  refreshTrigger: 0,
  refreshData: () => {},
  marketContext: { seasonId: "ss12", marketMode: "season_normal" },
  marketContextReady: false,
  setMarketContext: () => {},
})

export function SectionRefreshProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [refreshTrigger, setRefreshTrigger] = useState(0)
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
    invalidateSectionData(queryClient, ctx)
    setRefreshTrigger(v => v + 1)
  }, [queryClient])

  const refreshData = useCallback(() => {
    invalidateMarketContextData(queryClient)
  }, [queryClient])

  const value = useMemo(() => ({
    refreshSections,
    refreshTrigger,
    refreshData,
    marketContext,
    marketContextReady,
    setMarketContext,
  }), [refreshSections, refreshTrigger, refreshData, marketContext, marketContextReady, setMarketContext])

  return (
    <SectionRefreshContext.Provider value={value}>
      {children}
    </SectionRefreshContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSectionRefresh() {
  return useContext(SectionRefreshContext)
}
