import { useState, useEffect, useCallback } from "react";
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

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : toast.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-amber-50 text-amber-700 border border-amber-200"
          }`}
        >
          {toast.type === "success" ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : toast.type === "error" ? (
            <AlertCircle className="w-4 h-4 text-red-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-500" />
          )}
          {toast.message}
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-1 opacity-60 hover:opacity-100"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast["type"], message: string) => {
    const id = String(Date.now());
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Auto dismiss after 3 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        dismissToast(toast.id);
      }, 3000)
    );
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [toasts, dismissToast]);

  return { toasts, addToast, dismissToast };
}
