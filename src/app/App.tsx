import { useState, lazy, Suspense } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { queryClient } from "@/lib/query"
import { SectionRefreshProvider } from "@/contexts/SectionRefreshContext"
import { SyncProvider } from "@/contexts/SyncContext"
import { useTauriEvents } from "@/hooks/useTauriEvents"
import { TopBar } from "@/components/layout/TopBar"
import { Sidebar } from "@/components/layout/Sidebar"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import type { PageId } from "@/lib/commands"

const DashboardContent = lazy(() => import("@/components/dashboard/DashboardContent"))
const StrategiesPage = lazy(() => import("@/components/dashboard/StrategiesPage"))
const SettingsPage = lazy(() => import("@/components/dashboard/SettingsPage"))
const ImportExportPage = lazy(() => import("@/components/dashboard/ImportExportPage"))
const ItemsPage = lazy(() => import("@/components/dashboard/ItemsPage"))
const DealsPage = lazy(() => import("@/components/dashboard/DealsPage"))
const PriceAnalysisPage = lazy(() => import("@/components/dashboard/PriceAnalysisPage"))
const AIAnalysisPage = lazy(() => import("@/components/dashboard/AIAnalysisPage"))
const DataMonitorPage = lazy(() => import("@/components/dashboard/DataMonitorPage"))
const FirePriceComparePage = lazy(() => import("@/components/dashboard/FirePriceComparePage"))
const HelpPage = lazy(() => import("@/components/dashboard/HelpPage"))
const AlertsPage = lazy(() => import("@/components/dashboard/AlertsPage"))
const ArbitragePage = lazy(() => import("@/components/dashboard/ArbitragePage"))

function PageLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex min-w-64 flex-col items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-8 py-7 shadow-[var(--shadow-glow)]">
        <img src="/torchscan/logo-mark.png" alt="TorchScan" className="h-16 w-16" />
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-panel-soft)]">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[linear-gradient(90deg,var(--color-brand),var(--color-brand-gold))]" />
        </div>
        <span className="text-xs font-medium text-[var(--color-text-subtle)]">正在点燃市场数据...</span>
      </div>
    </div>
  )
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoading />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard")
  useTauriEvents()

  return (
    <QueryClientProvider client={queryClient}>
      <SectionRefreshProvider>
        <SyncProvider>
          <div className="torchscan-theme flex h-screen flex-col overflow-hidden">
            <TopBar page={page} onPageChange={setPage} />
            <div className="relative z-[1] flex min-h-0 flex-1">
              <Sidebar page={page} onPageChange={setPage} />
              <main className="torchscan-main scrollbar-thin flex-1 overflow-auto px-5 py-5">
                {page === "dashboard" && (
                  <LazyPage>
                    <DashboardContent />
                  </LazyPage>
                )}
                {/* season 路由已移除，改用 firecompare 火价分析页面 */}
                {page === "strategies" && (
                  <LazyPage>
                    <StrategiesPage />
                  </LazyPage>
                )}
                {page === "settings" && (
                  <LazyPage>
                    <SettingsPage />
                  </LazyPage>
                )}
                {page === "import_export" && (
                  <LazyPage>
                    <ImportExportPage />
                  </LazyPage>
                )}
                {page === "items" && (
                  <LazyPage>
                    <ItemsPage />
                  </LazyPage>
                )}
                {page === "deals" && (
                  <LazyPage>
                    <DealsPage />
                  </LazyPage>
                )}
                {page === "priceanalysis" && (
                  <LazyPage>
                    <PriceAnalysisPage />
                  </LazyPage>
                )}
                {page === "aianalysis" && (
                  <LazyPage>
                    <AIAnalysisPage />
                  </LazyPage>
                )}
                {page === "records" && (
                  <LazyPage>
                    <DataMonitorPage />
                  </LazyPage>
                )}
                {page === "firecompare" && (
                  <LazyPage>
                    <FirePriceComparePage />
                  </LazyPage>
                )}
                {page === "help" && (
                  <LazyPage>
                    <HelpPage />
                  </LazyPage>
                )}
                {page === "alerts" && (
                  <LazyPage>
                    <AlertsPage />
                  </LazyPage>
                )}
                {page === "arbitrage" && (
                  <LazyPage>
                    <ArbitragePage />
                  </LazyPage>
                )}
              </main>
            </div>
          </div>
        </SyncProvider>
      </SectionRefreshProvider>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  )
}
