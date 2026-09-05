import { EXTENSION_API_VERSION, type CoreContext } from "../../types";
import {
  registerCourseCompletedProvider,
  unregisterCourseCompletedProvider,
  registerDbBackupParticipant,
  unregisterDbBackupParticipant,
} from "../../registry";
import CourseSchedulePage from "./Page";
import TodayCourses from "../../../components/today/TodayCourses";
import { initExtensionDatabase, closeExtensionDatabase, snapshotExtensionDbTo } from "./data/dbLoader";
import { importLegacyIfEmpty, backfillTaskLinks, sweepOrphanTaskLinks } from "./data/import";
import { ExtensionCourseRepository } from "./data/repository";

const courseRepo = new ExtensionCourseRepository();

/**
 * DailyFlow 第一个 Extension：课程表（Course Schedule）。
 * - 导航页：启用后在侧栏出现「课程」，独立页面维护每周固定安排；
 * - Today 槽位：启用后今日页显示「今日课程」（加入今日）；
 * - 数据：独立 SQLite（init 打开并自动建表；空库时一次性导入 Core 旧表数据）；
 * - 禁用仅隐藏上述入口，不删除任何数据。
 */
export const manifest = {
  id: "com.dailyflow.course-schedule",
  name: "课程表",
  description: "每周固定课程安排、今日课程联动与课程任务（首个 Extension 验证对象）",
  version: "1.1.0",
  apiVersion: EXTENSION_API_VERSION,
  author: "DailyFlow",
};

/** 异步初始化：打开独立库并（空库时）从 Core 旧表命中导入历史数据，回填任务映射，清扫孤儿映射。 */
export async function init(ctx: CoreContext): Promise<void> {
  const db = await initExtensionDatabase();
  if (ctx.legacy) {
    const [courses, slots, pairs] = await Promise.all([
      ctx.legacy.listCourses(),
      ctx.legacy.listSlots(),
      ctx.legacy.listTaskCoursePairs(),
    ]);
    await importLegacyIfEmpty(db, { courses, slots });
    await backfillTaskLinks(db, pairs);
  }
  // 孤儿映射清扫（幂等；经 ctx 只读回查 Core 任务，不触碰任务数据）
  if (ctx.tasks?.listByIds) {
    await sweepOrphanTaskLinks(db, (ids) => ctx.tasks.listByIds(ids));
  }
}

export function activate(ctx: CoreContext) {
  // 课程成就数据源：task_links + Core Data API（Core 成就引擎经 Host Provider 查询）
  registerCourseCompletedProvider(manifest.id, async () => {
    const ids = await courseRepo.taskIdsAll();
    if (ids.length === 0) return 0;
    const rows = await ctx.tasks.listByIds(ids);
    return rows.filter((r) => r.status === "COMPLETED").length;
  });
  // 独立库备份参与者（A1-P0Fix-③）：备份/恢复覆盖 course-schedule.db
  registerDbBackupParticipant({
    snapshotTo: (absTarget) => snapshotExtensionDbTo(absTarget),
    close: () => closeExtensionDatabase(),
  });
  return {
    nav: { page: "ext:course-schedule", label: "课程" },
    Page: CourseSchedulePage,
    slots: {
      today: TodayCourses,
    },
  };
}

/** 停用钩子（禁用扩展时由 Host 调用）：反注册成就数据源与备份参与者；不删任何数据。 */
export function deactivate(_ctx: CoreContext): void {
  unregisterCourseCompletedProvider(manifest.id);
  unregisterDbBackupParticipant();
}
