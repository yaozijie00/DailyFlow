import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { extensionStorage, extensionStorageMeta } from "../schema";

export class ExtensionStorageRepository {
  constructor(
    private readonly db: Db,
    private readonly extensionId: string,
  ) {
    if (!extensionId.trim()) throw new Error("扩展 ID 不能为空");
  }

  async get(key: string): Promise<string | null> {
    const row = await this.db
      .select({ valueJson: extensionStorage.valueJson })
      .from(extensionStorage)
      .where(
        and(
          eq(extensionStorage.extensionId, this.extensionId),
          eq(extensionStorage.key, key),
        ),
      )
      .get();
    return row?.valueJson ?? null;
  }

  async set(key: string, valueJson: string): Promise<void> {
    await this.db
      .insert(extensionStorage)
      .values({ extensionId: this.extensionId, key, valueJson, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: [extensionStorage.extensionId, extensionStorage.key],
        set: { valueJson, updatedAt: Date.now() },
      })
      .run();
  }

  async delete(key: string): Promise<boolean> {
    const rows = await this.db
      .delete(extensionStorage)
      .where(
        and(
          eq(extensionStorage.extensionId, this.extensionId),
          eq(extensionStorage.key, key),
        ),
      )
      .returning({ id: extensionStorage.id })
      .all();
    return rows.length > 0;
  }

  async keys(): Promise<string[]> {
    const rows = await this.db
      .select({ key: extensionStorage.key })
      .from(extensionStorage)
      .where(eq(extensionStorage.extensionId, this.extensionId))
      .orderBy(asc(extensionStorage.key))
      .all();
    return rows.map((row) => row.key);
  }

  async getVersion(): Promise<number> {
    const row = await this.db
      .select({ version: extensionStorageMeta.version })
      .from(extensionStorageMeta)
      .where(eq(extensionStorageMeta.extensionId, this.extensionId))
      .get();
    return row?.version ?? 0;
  }

  async setVersion(version: number): Promise<void> {
    const updatedAt = Date.now();
    await this.db
      .insert(extensionStorageMeta)
      .values({ extensionId: this.extensionId, version, updatedAt })
      .onConflictDoUpdate({
        target: extensionStorageMeta.extensionId,
        set: { version, updatedAt },
      })
      .run();
  }
}
