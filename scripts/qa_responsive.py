"""DailyFlow 桌面窗口响应式冒烟检查（需要本地 Vite 服务）。"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


VIEWPORTS = (
    (800, 600),
    (960, 720),
    (1180, 800),
    (1440, 900),
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cdp", default="http://127.0.0.1:9222")
    parser.add_argument("--screenshots", action="store_true")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(tempfile.gettempdir()) / "dailyflow-responsive-qa",
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    report: list[dict[str, object]] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(args.cdp)
        page = next(
            (
                candidate
                for context in browser.contexts
                for candidate in context.pages
                if candidate.url.startswith("http://localhost:1420")
            ),
            None,
        )
        if page is None:
            raise RuntimeError("CDP 已连接，但没有找到 DailyFlow 桌面页面")
        page.set_default_timeout(10_000)
        original_workflow_ui = page.evaluate("() => localStorage.getItem('dailyflow.workflow.ui.v2')")
        page.reload(wait_until="domcontentloaded")
        page.get_by_text("已保存到本机", exact=True).wait_for(state="visible")
        for width, height in VIEWPORTS:
            page.set_viewport_size({"width": width, "height": height})
            console_errors: list[str] = []
            page_errors: list[str] = []
            page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.get_by_text("已保存到本机", exact=True).wait_for(state="visible")
            def metrics_for(name: str) -> dict[str, object]:
                metrics = page.evaluate(
                    """() => ({
                    viewportWidth: window.innerWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    mainWidth: document.querySelector('main')?.clientWidth ?? 0,
                    mainScrollWidth: document.querySelector('main')?.scrollWidth ?? 0,
                    rootTextLength: document.querySelector('#root')?.textContent?.length ?? 0,
                    sidebarCollapsed: document.querySelector('.df-sidebar')?.dataset.collapsed === 'true',
                    hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
                    mainHasHorizontalOverflow: (document.querySelector('main')?.scrollWidth ?? 0) > (document.querySelector('main')?.clientWidth ?? 0) + 1,
                    primaryActionVisible: [...document.querySelectorAll('button')].some((button) => {
                      const rect = button.getBoundingClientRect();
                      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
                    }),
                })"""
                )
                return {"name": name, **metrics}

            page.locator('nav[aria-label="主导航"]').get_by_role("button", name="今日", exact=True).click()
            page.get_by_role("button", name="新建", exact=True).wait_for(state="visible")
            scenarios = [metrics_for("today")]
            page.locator('nav[aria-label="主导航"]').get_by_role("button", name="Workflow", exact=True).click()
            page.get_by_role("tab", name="模板库", exact=True).wait_for(state="visible")
            page.get_by_role("tab", name="模板库", exact=True).click()
            scenarios.append(metrics_for("workflow-library"))

            page.get_by_role("button", name="运行", exact=True).first.click()
            page.get_by_role("dialog").wait_for(state="visible")
            scenarios.append(metrics_for("workflow-runner"))
            page.get_by_role("button", name="关闭运行面板", exact=True).click()

            page.get_by_role("tab", name="运行中心", exact=True).click()
            page.get_by_role("heading", name="运行中心", exact=True).wait_for(state="visible")
            scenarios.append(metrics_for("workflow-runs"))

            if (width, height) == VIEWPORTS[0]:
                page.evaluate(
                    """() => localStorage.setItem('dailyflow.workflow.ui.v2', JSON.stringify({
                        view: 'editor', selectedTemplateId: 'builtin.general-project'
                    }))"""
                )
                page.reload(wait_until="domcontentloaded")
                page.get_by_text("已保存到本机", exact=True).wait_for(state="visible")
                page.locator('nav[aria-label="主导航"]').get_by_role("button", name="Workflow", exact=True).click()
            else:
                page.get_by_role("tab", name="编辑器", exact=True).click()
            page.get_by_role("button", name="保存", exact=True).wait_for(state="visible")
            scenarios.append(metrics_for("workflow-editor"))

            failures = [item["name"] for item in scenarios if item["hasHorizontalOverflow"] or item["mainHasHorizontalOverflow"] or not item["primaryActionVisible"]]
            if failures:
                raise AssertionError(f"{width}x{height} 响应式检查失败：{failures}")

            screenshot = args.output / f"workflow-{width}x{height}.png"
            if args.screenshots:
                page.screenshot(path=str(screenshot), full_page=False)
            report.append(
                {
                    "viewport": f"{width}x{height}",
                    "scenarios": scenarios,
                    "consoleErrors": console_errors,
                    "pageErrors": page_errors,
                    "screenshot": str(screenshot) if args.screenshots else None,
                }
            )
        page.evaluate(
            "value => value === null ? localStorage.removeItem('dailyflow.workflow.ui.v2') : localStorage.setItem('dailyflow.workflow.ui.v2', value)",
            original_workflow_ui,
        )
        page.locator('nav[aria-label="主导航"]').get_by_role("button", name="今日", exact=True).click()
        browser.close()

    report_path = args.output / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(report_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
