import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../db/test-helpers";
import type { Db } from "../db/db";
import { SettingsRepository } from "../db/repositories/settingsRepository";
import { SettingsService, DEFAULT_SETTINGS } from "./settingsService";

describe("SettingsService", () => {
  let db: Db;
  let close: () => void;
  let repo: SettingsRepository;
  let service: SettingsService;

  beforeEach(async () => {
    const t = await createTestDb();
    db = t.db;
    close = t.close;
    repo = new SettingsRepository(db);
    service = new SettingsService(repo);
  });

  afterEach(() => close());

  it("默认值：番茄 25 分钟、时间轴 08:00-24:00、吸附 15 分钟", async () => {
    expect(DEFAULT_SETTINGS).toEqual({
      pomodoroDurationMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      timelineStartMinutes: 8 * 60,
      timelineEndMinutes: 24 * 60,
      timelineSnapMinutes: 15,
    });
    const s = await service.getSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("读取已保存的值（未保存的键保持默认）", async () => {
    await repo.set("timeline_start", "09:30");
    await repo.set("timeline_snap", "30");
    const s = await service.getSettings();
    expect(s.timelineStartMinutes).toBe(570); // 09:30
    expect(s.timelineSnapMinutes).toBe(30);
    expect(s.pomodoroDurationMinutes).toBe(25);
    expect(s.timelineEndMinutes).toBe(1440);
  });

  it("update 持久化到 settings 表；新实例（模拟重启）仍能读到", async () => {
    await service.update({
      pomodoroDurationMinutes: 45,
      timelineStartMinutes: 9 * 60,
      timelineEndMinutes: 21 * 60,
      timelineSnapMinutes: 30,
    });
    const stored = await repo.getAll();
    expect(stored["pomodoro_duration"]).toBe("2700"); // 秒
    expect(stored["timeline_start"]).toBe("09:00");
    expect(stored["timeline_end"]).toBe("21:00");
    expect(stored["timeline_snap"]).toBe("30");

    // 模拟重启：同一数据库上新建 Service
    const restarted = new SettingsService(repo);
    const s = await restarted.getSettings();
    expect(s).toEqual({
      pomodoroDurationMinutes: 45,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakInterval: 4,
      timelineStartMinutes: 9 * 60,
      timelineEndMinutes: 21 * 60,
      timelineSnapMinutes: 30,
    });
  });

  it("update 夹取非法时间轴区间（end <= start 时自动扩到 start+1h）", async () => {
    await service.update({ timelineStartMinutes: 1410, timelineEndMinutes: 1380 }); // 23:30 → 23:00
    const s = await service.getSettings();
    expect(s.timelineEndMinutes).toBeGreaterThan(s.timelineStartMinutes);
    expect(s.timelineStartMinutes).toBe(1410);
  });

  it("无效的存量数据回退默认值", async () => {
    await repo.set("pomodoro_duration", "abc");
    await repo.set("timeline_start", "xyz");
    await repo.set("timeline_snap", "-5");
    const s = await service.getSettings();
    expect(s.pomodoroDurationMinutes).toBe(25);
    expect(s.timelineStartMinutes).toBe(8 * 60);
    expect(s.timelineSnapMinutes).toBe(15);
  });

  it("update 夹取越界输入（时长 1-180、吸附 5-60）", async () => {
    await service.update({ pomodoroDurationMinutes: 0, timelineSnapMinutes: 3 });
    const s = await service.getSettings();
    expect(s.pomodoroDurationMinutes).toBe(1);
    expect(s.timelineSnapMinutes).toBe(5);

    await service.update({ pomodoroDurationMinutes: 999, timelineSnapMinutes: 120 });
    const s2 = await service.getSettings();
    expect(s2.pomodoroDurationMinutes).toBe(180);
    expect(s2.timelineSnapMinutes).toBe(60);
  });

  describe("番茄钟休息设置", () => {
    it("默认值：短休5 / 长休15 / 间隔4", async () => {
      const s = await service.getSettings();
      expect(s.shortBreakMinutes).toBe(5);
      expect(s.longBreakMinutes).toBe(15);
      expect(s.longBreakInterval).toBe(4);
    });

    it("update 保存并 clamp：短休1-30 / 长休1-60 / 间隔2-10", async () => {
      await service.update({
        shortBreakMinutes: 99,
        longBreakMinutes: 0,
        longBreakInterval: 1,
      });
      const s = await service.getSettings();
      expect(s.shortBreakMinutes).toBe(30);
      expect(s.longBreakMinutes).toBe(1);
      expect(s.longBreakInterval).toBe(2);
      await service.update({ shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4 });
    });
  });
});
