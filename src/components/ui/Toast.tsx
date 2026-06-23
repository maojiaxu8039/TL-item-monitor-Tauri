import { X, Check, AlertCircle } from "lucide-react";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "warning";
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const TOAST_STYLES = {
  success: {
    container:
      "border border-[#16a34a] bg-[#16a34a] text-white shadow-lg shadow-[rgba(22,163,74,0.35)]",
    icon: "text-white",
  },
  error: {
    container:
      "border border-[#dc2626] bg-[#dc2626] text-white shadow-lg shadow-[rgba(220,38,38,0.35)]",
    icon: "text-white",
  },
  warning: {
    container:
      "border border-[#d97706] bg-[#d97706] text-white shadow-lg shadow-[rgba(217,119,6,0.35)]",
    icon: "text-white",
  },
} as const;

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const styles = TOAST_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium min-w-[200px] max-w-[420px] animate-in slide-in-from-right-full duration-300 ${styles.container}`}
            role="status"
          >
            {toast.type === "success" ? (
              <Check className={`w-4 h-4 shrink-0 ${styles.icon}`} />
            ) : toast.type === "error" ? (
              <AlertCircle className={`w-4 h-4 shrink-0 ${styles.icon}`} />
            ) : (
              <AlertCircle className={`w-4 h-4 shrink-0 ${styles.icon}`} />
            )}
            <span className="flex-1 truncate">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="ml-1 opacity-70 hover:opacity-100 shrink-0"
              aria-label="关闭"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}