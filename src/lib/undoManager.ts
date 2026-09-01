import type { Task } from "../db/repositories/taskRepository";

/**
 * 通用撤销/重做管理器（Undo Stack + Redo Stack）。
 *
 * - 每个动作包含 undo() / redo()（可异步）；
 * - push 新动作会清空 redo 栈（撤销后再执行新操作，重做路径失效）；
 * - undo/redo 应用期间 applying=true，业务层据此跳过「把恢复操作再次入栈」，
 *   避免撤销本身产生新的撤销记录；
 * - 模块级单例 undoManager：Service 层推送动作，快捷键层消费。
 *
 * 接入原则（V1.4.1）：
 * - Timeline 时间块移动 / 任务编辑 / 完成 / 取消 / 创建 已接入（service 层捕获）；
 * - 任务删除暂不接入（会级联删除 focus_sessions，恢复成本高，列为后续工作）。
 */
export interface UndoableAction {
  /** 动作类型（如 task.update / task.create） */
  type: string;
  /** 人类可读描述（可用于提示） */
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

export class UndoManager {
  private undoStack: UndoableAction[] = [];
  private redoStack: UndoableAction[] = [];
  /** 正在应用 undo/redo（业务层据此跳过入栈） */
  applying = false;

  push(action: UndoableAction): void {
    this.undoStack.push(action);
    this.redoStack = []; // 新动作使 redo 失效
  }

  /** 撤销最近一个动作；无可撤销动作返回 false。 */
  async undo(): Promise<boolean> {
    const action = this.undoStack.pop();
    if (!action) return false;
    this.applying = true;
    try {
      await action.undo();
      this.redoStack.push(action);
    } finally {
      this.applying = false;
    }
    return true;
  }

  /** 重做最近一个被撤销的动作；无可重做动作返回 false。 */
  async redo(): Promise<boolean> {
    const action = this.redoStack.pop();
    if (!action) return false;
    this.applying = true;
    try {
      await action.redo();
      this.undoStack.push(action);
    } finally {
      this.applying = false;
    }
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get undoSize(): number {
    return this.undoStack.length;
  }

  get redoSize(): number {
    return this.redoStack.length;
  }
}

export const undoManager = new UndoManager();

/**
 * 任务可撤销字段。排除派生/累计字段：
 * - sortOrder：由 reorderByTime 每次更新后重排，还原它会造成顺序回跳；
 * - actualDuration：由专注完成累加，还原它会抹掉后续专注投入。
 */
export const TASK_UNDOABLE_FIELDS = [
  "title",
  "categoryId",
  "status",
  "estimatedDuration",
  "plannedStart",
  "plannedEnd",
  "completedAt",
  "notes",
  "goalId",
] as const;

export type TaskUndoableField = (typeof TASK_UNDOABLE_FIELDS)[number];

/**
 * 计算从状态 a 变换到状态 b 所需的字段更新（仅含发生变化的可撤销字段）。
 * 供 undo/redo 复用：undo = diffTaskUpdate(after, before)，redo = diffTaskUpdate(before, after)。
 */
export function diffTaskUpdate(
  a: Pick<Task, TaskUndoableField> | null | undefined,
  b: Pick<Task, TaskUndoableField> | null | undefined,
): Partial<Pick<Task, TaskUndoableField>> {
  const out: Partial<Pick<Task, TaskUndoableField>> = {};
  if (!a || !b) return out;
  for (const field of TASK_UNDOABLE_FIELDS) {
    if (a[field] !== b[field]) {
      (out as Record<string, unknown>)[field] = b[field];
    }
  }
  return out;
}
