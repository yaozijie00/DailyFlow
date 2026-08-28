import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit 配置：用于生成 SQLite 迁移文件。
 * 执行 `npm run db:generate` 会读取 src/db/schema.ts，
 * 在 src/db/migrations/ 下生成版本化 SQL 迁移。
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: "file:./dailyflow.db",
  },
});
