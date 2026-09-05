import CourseSchedule from "../../../components/goals/CourseSchedule";

/**
 * 课程表 Extension 页面（独立导航页）：
 * 页面容器本身由 Extension 提供；数据（courses/weekly_slots）第一阶段仍由
 * Core 库承载，经数据 API 访问（数据迁独立库为后续阶段）。
 */
export default function CourseSchedulePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <CourseSchedule />
    </div>
  );
}
