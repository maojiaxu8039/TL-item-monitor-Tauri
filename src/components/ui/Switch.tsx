import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, disabled = false, className }: SwitchProps) {
  return (
    <label className={cn("relative inline-flex items-center cursor-pointer", disabled && "opacity-50 cursor-not-allowed", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only peer"
      />
      <div className={cn(
        "w-9 h-5 rounded-full transition-all duration-200",
        "peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-brand)]/30",
        checked 
          ? "bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))]" 
          : "bg-[var(--color-panel-soft)] border border-[var(--color-border)]",
        "after:content-[''] after:absolute after:top-[2px] after:left-[2px]",
        "after:bg-[var(--color-text)] after:rounded-full after:h-4 after:w-4 after:transition-all",
        checked && "after:translate-x-full after:bg-white after:border-white/30"
      )} />
    </label>
  );
}