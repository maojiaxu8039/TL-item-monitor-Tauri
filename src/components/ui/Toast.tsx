import { useState, useCallback } from "react";
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
          className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-[var(--shadow-lg)] ${
            toast.type === "success"
              ? "border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.12)] text-green-200"
              : toast.type === "error"
              ? "border border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.12)] text-red-200"
              : "border border-[rgba(255,184,0,0.32)] bg-[rgba(255,184,0,0.12)] text-[var(--color-brand-gold)]"
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
