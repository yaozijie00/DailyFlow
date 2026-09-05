import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import MiniApp from "./pages/MiniApp";
import ErrorBoundary from "./components/ErrorBoundary";
import { log, showFatal } from "./lib/startupLog";
import { applyTheme, parseThemeMode, systemPrefersDark } from "./lib/theme";
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

// A4：同一前端 bundle 服务主窗与 Mini 窗 —— 按窗口身份分派 UI。
// 三重判定（任一命中即 Mini）：
//   1) Tauri 窗口 label === "mini"（最可靠）；
//   2) URL hash #window=mini（Vite 重定向/丢 query 时 hash 仍保留）；
//   3) URL query ?window=mini（旧版兼容/非 Tauri 预览）。
function detectIsMini(): boolean {
  try {
    if (getCurrentWindow().label === "mini") return true;
  } catch {
    /* 非 Tauri 环境（浏览器预览/测试） */
  }
  try {
    const url = new URL(window.location.href);
    if (url.hash.includes("window=mini")) return true;
    return url.searchParams.get("window") === "mini";
  } catch {
    return false;
  }
}

const isMini = detectIsMini();
log(`window mode: ${isMini ? "mini" : "main"}`);

// 主题初值：DB 设置加载前先按系统偏好设默认（浅/深），
// settingsStore.load 完成后会按持久化 theme_mode 覆盖（含 glass）。
applyTheme(parseThemeMode(null), systemPrefersDark());

const rootEl = document.getElementById("root");
if (!rootEl) {
  showFatal("缺少 #root 元素：index.html 未正确加载");
} else {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>{isMini ? <MiniApp /> : <App />}</ErrorBoundary>
      </React.StrictMode>,
    );
    log("React 已挂载");
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e);
    showFatal(msg);
  }
}
