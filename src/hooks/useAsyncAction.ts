import { useCallback, useState } from "react"
import { errorMessage } from "@/lib/utils"
import { toast } from "sonner"

export interface AsyncActionOptions {
  successMessage?: string
  errorMessage?: string
  showErrorToast?: boolean
  showSuccessToast?: boolean
}

export interface AsyncActionState {
  loading: boolean
  error: Error | null
}

export interface UseAsyncActionReturn<TArgs extends unknown[], TResult> {
  loading: boolean
  error: Error | null
  run: (...args: TArgs) => Promise<TResult | undefined>
  reset: () => void
}

export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: AsyncActionOptions = {},
): UseAsyncActionReturn<TArgs, TResult> {
  const [state, setState] = useState<AsyncActionState>({
    loading: false,
    error: null,
  })

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setState({ loading: true, error: null })
      try {
        const result = await action(...args)
        setState({ loading: false, error: null })
        if (options.showSuccessToast !== false && options.successMessage) {
          toast.success(options.successMessage)
        }
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(errorMessage(err))
        setState({ loading: false, error })
        if (options.showErrorToast !== false) {
          const msg = options.errorMessage || errorMessage(err)
          toast.error(msg)
        }
        return undefined
      }
    },
    [action, options],
  )

  const reset = useCallback(() => {
    setState({ loading: false, error: null })
  }, [])

  return {
    loading: state.loading,
    error: state.error,
    run,
    reset,
  }
}
