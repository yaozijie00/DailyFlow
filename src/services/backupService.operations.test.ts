import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), run: vi.fn(), snapshot: vi.fn(), participant: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("../db/db", () => ({
  getDb: () => ({ run: mocks.run }), makeDb: vi.fn(), closeDb: vi.fn(), initDatabase: vi.fn(),
}));
vi.mock("../extensions/registry", () => ({ getDbBackupParticipant: mocks.participant }));
import { exportBackup, backupBeforeRestore } from "./backupService";

describe("backup publication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockImplementation(async (command: string) => command === "backups_dir" ? "D:\\backups" : undefined);
    mocks.run.mockResolvedValue(undefined);
    mocks.participant.mockReturnValue({ snapshotTo: mocks.snapshot });
    mocks.snapshot.mockResolvedValue(true);
  });

  it("keeps an existing valid export when snapshot creation fails", async () => {
    mocks.run.mockRejectedValueOnce(new Error("disk full"));
    await expect(exportBackup()).rejects.toThrow("disk full");
    expect(mocks.invoke.mock.calls.some(([command]) => command === "delete_backup")).toBe(false);
    expect(mocks.invoke.mock.calls.some(([command]) => command === "publish_backup")).toBe(false);
  });

  it("surfaces companion failure without publishing an incomplete backup", async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error("course snapshot failed"));
    await expect(exportBackup()).rejects.toThrow("course snapshot failed");
    expect(mocks.invoke.mock.calls.some(([command]) => command === "publish_backup")).toBe(false);
  });

  it("publishes only after both snapshots and gives same-day exports distinct names", async () => {
    const first = await exportBackup();
    const second = await exportBackup();
    expect(first).not.toBe(second);
    expect(first).toMatch(/DailyFlow_Backup_.*\.db$/);
    expect(mocks.snapshot.mock.calls[0][0]).toMatch(/\.db\.pending\.course$/);
    expect(mocks.invoke.mock.calls.filter(([command]) => command === "publish_backup")).toHaveLength(2);
  });

  it("aborts the safety backup on companion failure before restore can close databases", async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error("course snapshot failed"));
    await expect(backupBeforeRestore()).rejects.toThrow("course snapshot failed");
  });
});
