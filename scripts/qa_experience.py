"""Exercise the shipped experience against an isolated real Tauri WebView."""
from pathlib import Path
import json, sqlite3, sys, time, re
from playwright.sync_api import sync_playwright, expect

sys.stdout.reconfigure(encoding="utf-8")
output = Path("artifacts/experience-implementation")
output.mkdir(parents=True, exist_ok=True)
checks = []
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9225")
    page = next(pg for c in browser.contexts for pg in c.pages if pg.url.startswith("http://localhost:1420"))
    page.set_viewport_size({"width":1280,"height":800})
    page.set_default_timeout(10000)
    data = page.evaluate("window.__TAURI_INTERNALS__.invoke('data_dir')")
    assert "experience-implementation" in data and "focus-native-qa" in data
    db = sqlite3.connect(f"file:{Path(data).as_posix()}/dailyflow.db?mode=ro", uri=True)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    nav = page.get_by_role("navigation", name="主导航")
    stamp = str(int(time.time()))
    task = "QA执行 " + stamp
    plan = "QA方向 " + stamp
    action = "QA长期下一步 " + stamp
    note = "QA收集原文 " + stamp
    def go(name): nav.get_by_role("button", name=name, exact=True).click()
    def shot(name): page.screenshot(path=str(output / (name + ".png")))
    def close(): page.get_by_role("dialog").last.get_by_role("button", name="关闭", exact=True).click()
    try:
        while page.get_by_role("dialog").count(): close()
        go("今日")
        quick = page.get_by_placeholder("快速添加任务，回车创建")
        quick.fill(task); quick.press("Enter")
        page.get_by_role("button", name="打开任务 " + task, exact=True).click()
        page.get_by_role("button", name="展开详情", exact=True).click()
        detail = page.get_by_role("dialog").last
        detail.get_by_role("button", name="编辑详情", exact=True).click()
        detail.get_by_label("说明与完成标准", exact=True).fill("做到：完成第一稿\n保留测试说明")
        detail.get_by_role("button", name="保存详情", exact=True).click()
        expect(detail.get_by_text("已保存", exact=True)).to_be_visible()
        assert db.execute("SELECT notes FROM tasks WHERE title=?", (task,)).fetchone()[0].startswith("做到")
        shot("task-detail")
        close(); checks.append("shared detail explicit save")
        go("长期")
        page.get_by_role("button", name="新建事项", exact=True).click()
        page.get_by_label("事项名称", exact=True).fill(plan)
        page.get_by_role("button", name="创建事项", exact=True).click()
        page.get_by_label("新下一步行动", exact=True).fill(action)
        page.get_by_role("button", name="添加下一步", exact=True).click()
        page.get_by_role("tab", name="甘特图", exact=True).click()
        page.get_by_role("button", name="调整日期 " + action, exact=True).click()
        dialog = page.get_by_role("dialog").last
        dialog.get_by_label("开始日期", exact=True).fill("2026-10-12")
        dialog.get_by_label("结束日期", exact=True).fill("2026-10-16")
        dialog.get_by_role("button", name="确认日期", exact=True).click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        row = db.execute("SELECT t.id,t.scheduled_date,r.start_day,r.end_day FROM tasks t JOIN task_planning_ranges r ON r.task_id=t.id WHERE title=?", (action,)).fetchone()
        assert row[1:] == ("", "2026-10-12", "2026-10-16")
        page.get_by_role("button", name="添加里程碑", exact=True).click()
        dialog = page.get_by_role("dialog").last
        dialog.get_by_label("所属事项", exact=True).select_option(label=plan)
        dialog.get_by_label("节点名称", exact=True).fill("QA第一稿 " + stamp)
        dialog.get_by_label("目标日期", exact=True).fill("2026-10-16")
        dialog.get_by_role("button", name="添加节点", exact=True).click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        bar = page.get_by_role("button", name=action + " 2026-10-12 至 2026-10-16", exact=True)
        box = bar.bounding_box(); assert box
        page.mouse.move(box["x"]+box["width"]/2,box["y"]+box["height"]/2)
        page.mouse.down(); page.mouse.move(box["x"]+box["width"]/2+32,box["y"]+box["height"]/2,steps=4); page.mouse.up()
        dialog = page.get_by_role("dialog").last
        expect(dialog.get_by_label("开始日期", exact=True)).to_have_value("2026-10-13")
        # Preview does not write until confirmed.
        assert db.execute("SELECT start_day FROM task_planning_ranges WHERE task_id=?",(row[0],)).fetchone()[0] == "2026-10-12"
        dialog.get_by_role("button", name="确认日期", exact=True).click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        shot("gantt"); checks.append("gantt ranges, milestone, drag preview and confirmation")
        go("今日")
        page.get_by_placeholder("记下想法，回车保存").fill(note)
        page.get_by_placeholder("记下想法，回车保存").press("Enter")
        page.get_by_role("button",name="展开整理",exact=True).click()
        dialog=page.get_by_role("dialog").last
        dialog.get_by_role("checkbox",name="选择 "+note,exact=True).check()
        dialog.get_by_label("安排日期").fill("2026-10-14")
        dialog.get_by_label("归属").select_option(label="计划 · "+plan)
        dialog.get_by_role("button",name="批量安排为任务",exact=True).click()
        expect(dialog.get_by_text("已处理 1 项，可撤销",exact=True)).to_be_visible()
        assert db.execute("SELECT count(*) FROM tasks WHERE title=? AND scheduled_date='2026-10-14'",(note,)).fetchone()[0]==1
        dialog.get_by_role("button",name=re.compile("^已处理 ")).click()
        shot("inbox")
        dialog.get_by_role("button",name="撤销整理",exact=True).click()
        expect(page.get_by_text("已撤销：整理收集项为任务",exact=True)).to_be_visible()
        expect(dialog.get_by_role("button",name=re.compile("^待整理 "))).to_be_visible()
        assert db.execute("SELECT count(*) FROM tasks WHERE title=?",(note,)).fetchone()[0]==0
        close(); checks.append("inbox batch ownership, source link and undo")
        go("专注")
        page.get_by_role("button",name="无任务计时",exact=True).click()
        page.get_by_label("计时模式",exact=True).select_option("countdown")
        page.get_by_label("本次目标（分钟）",exact=True).fill("1")
        page.get_by_label("这次想做到（可选）",exact=True).fill("QA阅读意图 "+stamp)
        page.get_by_role("button",name="开始无任务计时",exact=True).click()
        expect(page.get_by_text("这次做到：QA阅读意图 "+stamp,exact=True)).to_be_visible()
        expect(page.get_by_text("距离本次目标",exact=True)).to_be_visible()
        shot("focus-running")
        for width,height in [(1440,900),(1100,720),(900,600),(820,560)]:
            page.set_viewport_size({"width":width,"height":height})
            box=page.get_by_role("button",name="暂停",exact=True).bounding_box()
            assert box and box["y"]+box["height"]<=height,(width,height,box)
        page.screenshot(path=str(output/"focus-minimum.png"))
        page.set_viewport_size({"width":1280,"height":800})
        page.get_by_role("button",name="暂停",exact=True).click()
        expect(page.get_by_role("button",name="继续",exact=True)).to_be_visible()
        page.get_by_role("button",name="继续",exact=True).click()
        page.get_by_role("button",name="结束本次",exact=True).click()
        page.get_by_role("button",name="保存投入",exact=True).click()
        expect(page.get_by_role("button",name="无任务计时",exact=True)).to_be_visible()
        assert db.execute("SELECT count(*) FROM focus_details WHERE intention=? AND status='finished'",("QA阅读意图 "+stamp,)).fetchone()[0]==1
        checks.append("native unlinked countdown, intention, pause/resume/finish")
        go("设置")
        page.get_by_role("navigation",name="设置分类").get_by_role("button",name="外观",exact=True).click()
        page.locator('input[name="theme-mode"]').nth(1).click()
        for index, style in enumerate(["classic","paper","forest","graphite"]):
            page.locator('input[name="appearance-style"]').nth(index).click()
            expect(page.locator("html")).to_have_attribute("data-appearance",style)
        page.reload(); page.get_by_text("已保存到本机",exact=True).wait_for()
        expect(page.locator("html")).to_have_attribute("data-appearance","graphite")
        checks.append("appearance styles persist through reload")
        assert not errors, errors
    except Exception:
        shot("failure")
        (output/"failure-text.txt").write_text(page.locator("body").inner_text(),encoding="utf-8")
        raise
    finally:
        (output/"ui-report.json").write_text(json.dumps({"checks":checks,"pageErrors":errors,"dataDir":data},ensure_ascii=False,indent=2),encoding="utf-8")
        db.close(); browser.close()
print(json.dumps(checks,ensure_ascii=False))
