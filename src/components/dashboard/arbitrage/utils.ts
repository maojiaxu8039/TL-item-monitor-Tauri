export const RECIPE_TYPES = [
  { value: "decompose", label: "分解" },
  { value: "synthesize", label: "合成" },
  { value: "exchange", label: "兑换" },
];

export function formatPrice(price: number): string {
  return price.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatProfitMargin(margin: number): string {
  const sign = margin >= 0 ? "+" : "";
  return `${sign}${margin.toFixed(1)}%`;
}

export function getRecipeTypeStyle(type: string) {
  switch (type) {
    case "decompose": return { badge: "bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)] border-[rgba(239,68,68,0.2)]", icon: "text-[var(--color-danger)]" };
    case "synthesize": return { badge: "bg-[rgba(34,197,94,0.12)] text-[var(--color-success)] border-[rgba(34,197,94,0.2)]", icon: "text-[var(--color-success)]" };
    case "exchange": return { badge: "bg-[rgba(255,184,0,0.12)] text-[var(--color-brand-gold)] border-[rgba(255,184,0,0.2)]", icon: "text-[var(--color-brand-gold)]" };
    default: return { badge: "bg-[var(--color-panel-soft)] text-[var(--color-text-muted)]", icon: "text-[var(--color-text-muted)]" };
  }
}

export function getRecipeTypeLabel(type: string) {
  return RECIPE_TYPES.find(t => t.value === type)?.label || type;
}

export function formatTime(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
