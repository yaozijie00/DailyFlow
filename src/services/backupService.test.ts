import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "../db/test-helpers";
import { getAppliedMigrationNames } from "../db/migrate";
import { validateBackupSchema, buildVacuumIntoSql } from "./backupService";

describe("buildVacuumIntoSql", () => {
  it("普通绝对路径原样嵌入（Windows 反斜杠不需转义）", () => {
    const sql = buildVacuumIntoSql(
      "C:\\Users\\Admin\\AppData\\Roaming\\com.dailyflow.app\\backups\\DailyFlow_Backup_2026-08-28.db",
    );
    expect(sql).toBe(
      "VACUUM INTO 'C:\\Users\\Admin\\AppData\\Roaming\\com.dailyflow.app\\backups\\DailyFlow_Backup_2026-08-28.db'",
    );
  });

  it("路径含单引号时双写转义", () => {
    const sql = buildVacuumIntoSql("C:\\data\\a'b.db");
    expect(sql).toBe("VACUUM INTO 'C:\\data\\a''b.db'");
  });
});

describe("validateBackupSchema（恢复前校验：完整性 + 必需表 + Schema 版本）", () => {
  it("合法备份（迁移记录与当前一致）通过", async () => {
    const current = await createTestDb();
    const backup = await createTestDb();
    const expected = await getAppliedMigrationNames(current.db);

    const result = await validateBackupSchema(backup.db, expected);
    expect(result.ok).toBe(true);

    await current.close();
    await backup.close();
  });

  it("Schema 版本不一致（迁移记录不同）拒绝恢复", async () => {
    const current = await createTestDb();
    const backup = await createTestDb();
    const expected = ["0000_some_old_migration.sql"]; // 模拟旧版本

    const result = await validateBackupSchema(backup.db, expected);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("版本");

    await current.close();
    await backup.close();
  });

  it("缺少必需表（不是有效的 DailyFlow 备份）拒绝恢复", async () => {
    const current = await createTestDb();
    const backup = await createTestDb();
    const expected = await getAppliedMigrationNames(current.db);
    await backup.db.run(sql.raw("DROP TABLE settings"));

    const result = await validateBackupSchema(backup.db, expected);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("表");

    await current.close();
    await backup.close();
  });
});
