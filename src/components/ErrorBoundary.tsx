import { Component, type ReactNode } from "react";
import { devLog } from "@/lib/devLog";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    devLog.error("ErrorBoundary caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="text-[var(--color-danger)] text-4xl font-bold">!</div>
          <div className="font-medium text-[var(--color-text)]">页面渲染出错</div>
          <div className="max-w-md text-center text-sm text-[var(--color-text-subtle)]">
            {this.state.error?.message || "未知错误"}
          </div>
          <button
            onClick={this.handleReset}
            className="rounded-lg bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-gold))] px-4 py-2 text-sm font-medium text-black transition-all hover:brightness-110"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
