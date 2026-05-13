import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface FormFieldProps {
  label?: string;
  description?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}

export function FormField({
  label,
  description,
  error,
  children,
  className,
  required,
}: FormFieldProps) {
  return (
    <div className={cn("form-field", className)}>
      {label && (
        <label className="form-field-label">
          {label}
          {required && <span className="text-[var(--color-danger)] ml-0.5">*</span>}
        </label>
      )}
      {description && <p className="form-field-description">{description}</p>}
      {children}
      {error && <p className="form-field-error">{error}</p>}
    </div>
  );
}
