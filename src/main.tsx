import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { log, showFatal } from "./lib/startupLog";
import "./index.css";

// ---- 全局错误捕获：任何未捕获异常都写日志 + 屏幕覆盖层，杜绝「白屏无从排查」 ----
window.addEventListener("error", (e) => {
  const msg = e.message ?? String(e.error ?? "unknown");
  log(`window.onerror: ${msg}`);
  showFatal(msg);
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
  log(`unhandledrejection: ${msg}`);
});

log("JS bundle 已加载");
log(`UA: ${navigator.userAgent}`);

const rootEl = document.getElementById("root");
if (!rootEl) {
  showFatal("缺少 #root 元素：index.html 未正确加载");
} else {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    );
    log("React 已挂载");
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    showFatal(msg);
  }
}
