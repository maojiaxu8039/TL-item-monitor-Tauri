import { Component, type ReactNode } from "react";

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
    console.error("ErrorBoundary caught:", error, info);
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
          <div className="text-red-500 text-4xl font-bold">⚠️</div>
          <div className="text-slate-700 font-medium">页面渲染出错</div>
          <div className="text-slate-400 text-sm max-w-md text-center">
            {this.state.error?.message || "未知错误"}
          </div>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
