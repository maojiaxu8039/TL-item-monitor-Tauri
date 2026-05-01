import { useState, lazy, Suspense } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { queryClient } from "@/lib/query"
import { SectionRefreshProvider } from "@/contexts/SectionRefreshContext"
import { useTauriEvents } from "@/hooks/useTauriEvents"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import type { PageId } from "@/types"

const DashboardContent = lazy(() => import("@/components/dashboard/DashboardContent"))
const SeasonPage = lazy(() => import("@/components/dashboard/SeasonPage"))
const StrategiesPage = lazy(() => import("@/components/dashboard/StrategiesPage"))
const SettingsPage = lazy(() => import("@/components/dashboard/SettingsPage"))
const ImportExportPage = lazy(() => import("@/components/dashboard/ImportExportPage"))
const ItemsPage = lazy(() => import("@/components/dashboard/ItemsPage"))
const AlertsPage = lazy(() => import("@/components/dashboard/AlertsPage"))
const DataMonitorPage = lazy(() => import("@/components/dashboard/DataMonitorPage"))
const FirePriceComparePage = lazy(() => import("@/components/dashboard/FirePriceComparePage"))
const HelpPage = lazy(() => import("@/components/dashboard/HelpPage"))

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
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
        <div className="flex h-screen bg-[#f7f8fb]">
          <Sidebar page={page} onPageChange={setPage} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-auto px-6 py-5">
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
              {page === "alerts" && (
                <LazyPage>
                  <AlertsPage />
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
            </main>
            <footer className="border-t border-slate-200/80 bg-white/80 backdrop-blur-sm px-6 py-2.5 text-center text-[11px] text-slate-400">
              Tauri 2.0 · 火炬之光：天限物品监控系统 · 数据仅供参考
            </footer>
          </div>
        </div>
      </SectionRefreshProvider>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  )
}
