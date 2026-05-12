import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface ToolbarProps {
  children: ReactNode;
  className?: string;
}

export function Toolbar({ children, className }: ToolbarProps) {
  return <div className={cn("toolbar", className)}>{children}</div>;
}

interface ToolbarFiltersProps {
  children: ReactNode;
  className?: string;
}

export function ToolbarFilters({ children, className }: ToolbarFiltersProps) {
  return <div className={cn("toolbar-filters", className)}>{children}</div>;
}

interface ToolbarActionsProps {
  children: ReactNode;
  className?: string;
}

export function ToolbarActions({ children, className }: ToolbarActionsProps) {
  return <div className={cn("toolbar-actions", className)}>{children}</div>;
}
