/** 任务状态 → 中文标签（TaskList / TaskDetail 共用，避免重复定义）。 */
export const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: "待办",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};
