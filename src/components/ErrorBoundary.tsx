import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * React 渲染错误边界：任何渲染期异常都会显示错误覆盖层（而非白屏），
 * 并写入 startup.log 供跨机排查。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      // 动态引入避免循环依赖
      void import("../lib/startupLog").then((m) =>
        m.log(`React ErrorBoundary: ${error.message}\n${info.componentStack ?? ""}`),
      );
    } catch {
      /* ignore */
    }
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "#fff",
            color: "#c00",
            padding: 24,
            font: "13px/1.6 monospace",
            whiteSpace: "pre-wrap",
            overflow: "auto",
          }}
        >
          DailyFlow 界面渲染出错：
          {"\n\n"}
          {err.message}
          {"\n\n"}
          {err.stack ?? ""}
          {"\n\n"}
          请截图此信息，或把 %LOCALAPPDATA%\DailyFlow\startup.log 发给开发者。
        </div>
      );
    }
    return this.props.children;
  }
}
