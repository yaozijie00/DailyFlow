import type { Db } from "../db/db";
import { ExtensionStorageRepository } from "../db/repositories/extensionStorageRepository";
import type {
  ExtensionStorage,
  ExtensionStorageMigration,
  JsonValue,
} from "./types";

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const migrationChains = new Map<string, Promise<void>>();

function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw new Error("扩展存储键必须为 1–128 位，并只包含字母、数字、点、下划线或连字符");
  }
}

function assertJsonValue(value: unknown, seen = new WeakSet<object>()): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error("扩展存储不接受 NaN 或无限数值");
  }
  if (typeof value !== "object") throw new Error("扩展存储只接受 JSON 值");
  if (seen.has(value)) throw new Error("扩展存储不接受循环引用");
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, seen);
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error("扩展存储只接受普通 JSON 对象");
    }
    for (const item of Object.values(value)) assertJsonValue(item, seen);
  }
  seen.delete(value);
}

function validateMigrations(
  targetVersion: number,
  migrations: ExtensionStorageMigration[],
): Map<number, ExtensionStorageMigration> {
  if (!Number.isSafeInteger(targetVersion) || targetVersion < 0) {
    throw new Error("扩展存储目标版本必须是非负安全整数");
  }
  const byVersion = new Map<number, ExtensionStorageMigration>();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version < 1) {
      throw new Error("扩展存储迁移版本必须是正安全整数");
    }
    if (byVersion.has(migration.version)) {
      throw new Error(`扩展存储迁移版本重复：${migration.version}`);
    }
    byVersion.set(migration.version, migration);
  }
  return byVersion;
}

export function createExtensionStorage(db: Db, extensionId: string): ExtensionStorage {
  const repo = new ExtensionStorageRepository(db, extensionId);
  const storage: ExtensionStorage = {
    get: async <T extends JsonValue>(key: string): Promise<T | null> => {
      assertKey(key);
      const raw = await repo.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    },
    set: async (key, value) => {
      assertKey(key);
      assertJsonValue(value);
      await repo.set(key, JSON.stringify(value));
    },
    delete: async (key) => {
      assertKey(key);
      return repo.delete(key);
    },
    keys: () => repo.keys(),
    version: () => repo.getVersion(),
    migrate: async (targetVersion, migrations) => {
      const byVersion = validateMigrations(targetVersion, migrations);
      const previous = migrationChains.get(extensionId) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(async () => {
        const installed = await repo.getVersion();
        if (installed > targetVersion) {
          throw new Error(
            `扩展存储版本 ${installed} 高于当前扩展支持的 ${targetVersion}，拒绝降级`,
          );
        }
        for (let version = installed + 1; version <= targetVersion; version += 1) {
          const migration = byVersion.get(version);
          if (!migration) throw new Error(`缺少扩展存储迁移版本：${version}`);
          await migration.migrate(storage);
          await repo.setVersion(version);
        }
      });
      migrationChains.set(extensionId, current);
      const release = () => {
        if (migrationChains.get(extensionId) === current) migrationChains.delete(extensionId);
      };
      void current.then(release, release);
      return current;
    },
  };
  return storage;
}
