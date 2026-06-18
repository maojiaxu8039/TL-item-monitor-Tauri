import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 从未知错误对象中安全提取错误消息，避免 [object Object] */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message
    if (typeof msg === "string") return msg
  }
  return String(err)
}
