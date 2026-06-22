import { useEffect } from "react"
import { errorMessage } from "@/lib/utils"
import { toast } from "sonner"

export function useGlobalErrorHandler(): void {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[Global Error]", event.error || event.message)
      const message = event.error
        ? errorMessage(event.error)
        : event.message || "发生未知错误"
      toast.error(`运行时错误: ${message}`)
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[Unhandled Promise Rejection]", event.reason)
      const message = errorMessage(event.reason)
      toast.error(`异步操作失败: ${message}`)
      event.preventDefault()
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])
}
