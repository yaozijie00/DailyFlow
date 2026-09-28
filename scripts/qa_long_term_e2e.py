"""Drive the real DailyFlow Tauri WebView through the long-term plan critical path."""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path

from playwright.sync_api import Page, Playwright, sync_playwright


def find_dailyflow_page(playwright: Playwright, cdp_url: str) -> tuple[object, Page]:
    browser = playwright.chromium.connect_over_cdp(cdp_url)
    for context in browser.contexts:
        for page in context.pages:
            if page.url.startswith("http://localhost:1420") and page.title() == "DailyFlow":
                return browser, page
    browser.close()
    raise RuntimeError("CDP 已连接，但没有找到 DailyFlow 页面。")


def navigate(page: Page, label: str) -> None:
    page.locator('nav[aria-label="主导航"]').get_by_role(
        "button", name=label, exact=True
    ).click()


def cleanup_task(page: Page, title: str) -> bool:
    try:
        navigate(page, "今日")
        task = page.get_by_role("button", name=f"打开任务 {title}", exact=True)
        if task.count() == 0:
            return True
        task.first.click()
        page.get_by_role("heading", name=title, exact=True).wait_for(state="visible")
        page.get_by_role("button", name="删除", exact=True).click()
        task.wait_for(state="detached")
        return True
    except Exception:
        return False


def cleanup_plan(page: Page, title: str) -> bool:
    try:
        needle = title.split("E2E ", 1)[-1]
        navigate(page, "长期")
        active_card = page.get_by_role("article").filter(has_text=needle)
        if active_card.count() > 0:
            active_card.first.get_by_role("button", name="查看计划", exact=True).click()
            page.get_by_role("heading").filter(has_text=needle).wait_for(state="visible")
        if page.get_by_role("heading", name=title, exact=True).count() > 0 or page.get_by_role("heading").filter(has_text=needle).count() > 0:
            page.get_by_role("button", name="放弃 / 归档计划", exact=True).click()
            page.get_by_role("heading", name="长期计划", exact=True).wait_for(state="visible")
        archived_toggle = page.get_by_role("button", name="已完成 / 归档", exact=False)
        if archived_toggle.count() == 0:
            return True
        archived_toggle.click()
        row = page.get_by_text(needle, exact=False).first.locator("..")
        if row.count() == 0:
            return True
        row.locator("button").last.click()
        page.get_by_text(title, exact=True).wait_for(state="detached")
        return True
    except Exception:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="DailyFlow 长期计划真实桌面流程回归")
    parser.add_argument("--cdp", default="http://127.0.0.1:9222")
    parser.add_argument(
        "--output", type=Path, default=Path("artifacts/qa/long-term-e2e")
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    suffix = f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:5]}"
    title = f"长期计划 E2E {suffix}"
    next_action = f"Blueprint Communication {suffix}"
    report: dict[str, object] = {
        "status": "running",
        "planTitle": title,
        "taskTitle": next_action,
        "steps": [],
        "consoleErrors": [],
        "pageErrors": [],
        "planCleaned": False,
        "taskCleaned": False,
    }
    browser = None
    page: Page | None = None
    exit_code = 0

    def passed(name: str) -> None:
        steps = report["steps"]
        assert isinstance(steps, list)
        steps.append({"name": name, "status": "passed"})
        print(f"PASS  {name}")

    try:
        with sync_playwright() as playwright:
            browser, page = find_dailyflow_page(playwright, args.cdp)
            page.set_default_timeout(10_000)
            console_errors = report["consoleErrors"]
            page_errors = report["pageErrors"]
            assert isinstance(console_errors, list)
            assert isinstance(page_errors, list)
            page.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error"
                else None,
            )
            page.on("pageerror", lambda error: page_errors.append(str(error)))

            page.get_by_text("已保存到本机", exact=True).wait_for(state="visible")
            navigate(page, "长期")
            page.get_by_role("heading", name="长期计划", exact=True).wait_for(
                state="visible"
            )
            page.get_by_text("本周长期投入", exact=True).wait_for(state="visible")
            passed("迁移完成并打开长期计划管理中心")

            page.get_by_role("button", name="新建计划", exact=True).click()
            page.get_by_label("计划名称", exact=True).fill(title)
            page.get_by_label("目标说明", exact=True).fill("能够独立完成一个 UE 小型场景")
            page.get_by_label("开始日期", exact=True).fill("2026-09-10")
            page.get_by_label("目标完成日期", exact=True).fill("2026-12-15")
            page.get_by_label("每周计划投入", exact=False).fill("6")
            page.get_by_label("下一步行动", exact=True).fill(next_action)
            page.get_by_role("button", name="创建长期计划", exact=True).click()
            card = page.get_by_role("article").filter(has_text=title)
            card.wait_for(state="visible")
            card.get_by_text("6h", exact=False).first.wait_for(state="visible")
            passed("创建计划并显示周目标、健康状态与下一步")

            card.get_by_role("button", name="查看计划", exact=True).click()
            page.get_by_role("heading", name=title, exact=True).wait_for(state="visible")
            page.get_by_text("目标完成日期", exact=True).wait_for(state="visible")
            passed("打开计划详情概览")

            page.get_by_role("button", name="计划", exact=True).click()
            page.get_by_label("新阶段名称", exact=True).fill("Blueprint")
            page.get_by_label("预计小时", exact=True).fill("8")
            page.get_by_role("button", name="添加阶段", exact=True).click()
            page.locator('input[value="Blueprint"]').wait_for(state="visible")
            page.locator('button[title="设为当前阶段"]').click()
            passed("添加阶段并设为当前阶段")

            page.get_by_role("button", name="加入今天", exact=True).click()
            page.get_by_role("button", name="任务", exact=True).click()
            page.get_by_text(next_action, exact=True).wait_for(state="visible")
            passed("把下一步行动推进到 Today 并保留计划关联")

            page.get_by_role("button", name="记录", exact=True).click()
            page.get_by_text("创建长期计划", exact=True).wait_for(state="visible")
            page.get_by_text("当前阶段", exact=True).wait_for(state="visible")
            passed("关键计划变化写入历史")

            page.get_by_role("button", name="概览", exact=True).click()
            page.get_by_role("button", name="暂停计划", exact=True).click()
            page.get_by_role("button", name="恢复计划", exact=True).wait_for(state="visible")
            page.get_by_role("button", name="恢复计划", exact=True).click()
            page.get_by_role("button", name="暂停计划", exact=True).wait_for(state="visible")
            passed("暂停与恢复计划")

            page.get_by_role("button", name="放弃 / 归档计划", exact=True).click()
            page.get_by_role("heading", name="长期计划", exact=True).wait_for(state="visible")
            archived_toggle = page.get_by_role("button", name="已完成 / 归档", exact=False)
            archived_toggle.click()
            row = page.get_by_text(title, exact=True).locator("..")
            row.locator("button").last.click()
            page.get_by_text(title, exact=True).wait_for(state="detached")
            report["planCleaned"] = True
            passed("归档并清理测试计划")

            report["taskCleaned"] = cleanup_task(page, next_action)
            if report["taskCleaned"] is not True:
                raise AssertionError("未能清理由长期计划创建的 Today 任务")
            passed("清理测试任务")

            if console_errors or page_errors:
                raise AssertionError(
                    f"发现运行时错误：console={console_errors}, page={page_errors}"
                )
            passed("流程中无 console error 或页面异常")
            report["status"] = "passed"
            page.screenshot(path=str(args.output / "long-term-home.png"), full_page=True)
            browser.close()
            browser = None
    except Exception as error:
        exit_code = 1
        report["status"] = "failed"
        report["error"] = str(error)
        print(f"FAIL  {error}", file=sys.stderr)
        if page is not None:
            try:
                page.screenshot(path=str(args.output / "failure.png"), full_page=True)
            except Exception:
                pass
        # sync_playwright 上下文因异常已经关闭时，重新连接一次执行安全清理。
        try:
            with sync_playwright() as recovery_playwright:
                recovery_browser, recovery_page = find_dailyflow_page(
                    recovery_playwright, args.cdp
                )
                recovery_page.set_default_timeout(10_000)
                if report["planCleaned"] is not True:
                    report["planCleaned"] = cleanup_plan(recovery_page, title)
                if report["taskCleaned"] is not True:
                    report["taskCleaned"] = cleanup_task(recovery_page, next_action)
                recovery_browser.close()
        except Exception as cleanup_error:
            report["cleanupError"] = str(cleanup_error)
    finally:
        if page is not None and report["planCleaned"] is not True:
            report["planCleaned"] = cleanup_plan(page, title)
        if page is not None and report["taskCleaned"] is not True:
            report["taskCleaned"] = cleanup_task(page, next_action)
        if browser is not None:
            try:
                browser.close()
            except Exception:
                pass
        report_path = args.output / "report.json"
        report_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(report_path.resolve())

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
