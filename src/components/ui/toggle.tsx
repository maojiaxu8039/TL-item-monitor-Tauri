import { forwardRef, type ComponentPropsWithoutRef } from "react";

interface ToggleProps extends Omit<ComponentPropsWithoutRef<"input">, "type" | "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** 统一的开关组件，替代各页面重复的 toggle switch 样式 */
export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ checked, onChange, disabled, ...props }, ref) => {
    return (
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
          {...props}
        />
        <div className="w-[36px] h-[20px] bg-[var(--color-panel-soft)] border border-[var(--color-border)] rounded-full transition-all duration-200 peer-checked:bg-gradient-to-r peer-checked:from-[var(--color-brand)] peer-checked:to-[var(--color-brand-gold)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--color-brand)]/30 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--color-text-subtle)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
      </label>
    );
  }
);

Toggle.displayName = "Toggle";
