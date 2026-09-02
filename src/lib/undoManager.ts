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
  /** 撤销历史上限（默认 50；可设置 20/50/100/200） */
  maxHistory = 50;
  private listeners = new Set<() => void>();
  /** 批量上下文：withBatch 内 push 的动作被合并为一个复合动作 */
  private batchDepth = 0;
  private batchActions: UndoableAction[] = [];

  push(action: UndoableAction): void {
    if (this.batchDepth > 0) {
      this.batchActions.push(action);
      this.notify();
      return;
    }
    this.undoStack.push(action);
    this.redoStack = []; // 新动作使 redo 失效
    // 超过上限：丢弃最旧记录（内存历史上限）
    while (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.notify();
  }

  /** 批量执行：fn 内 push 的所有动作合并为一个复合动作（一次 Undo 整体撤销）。 */
  withBatch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.flushBatch();
    }
  }

  /** 异步批量执行（转换类操作内部为异步 push 时使用）。 */
  async withBatchAsync<T>(fn: () => Promise<T>): Promise<T> {
    this.batchDepth++;
    try {
      return await fn();
    } finally {
      this.flushBatch();
    }
  }

  private flushBatch(): void {
    this.batchDepth--;
    if (this.batchDepth === 0 && this.batchActions.length > 0) {
      const actions = this.batchActions;
      this.batchActions = [];
      this.push({
        type: `batch:${actions[0].type}`,
        label: actions[0].label,
        undo: async () => {
          for (const a of [...actions].reverse()) await a.undo();
        },
        redo: async () => {
          for (const a of actions) await a.redo();
        },
      });
    }
  }

  /** 撤销最近一个动作；无可撤销动作返回 false。失败时不移动栈并抛出。 */
  async undo(): Promise<boolean> {
    const action = this.undoStack.pop();
    if (!action) return false;
    this.applying = true;
    try {
      await action.undo();
      this.redoStack.push(action);
    } catch (e) {
      // 撤销失败：把动作放回撤销栈顶部，保持栈一致，由调用方提示
      this.undoStack.push(action);
      throw e;
    } finally {
      this.applying = false;
    }
    this.notify();
    return true;
  }

  /** 重做最近一个被撤销的动作；无可重做动作返回 false。失败时不移动栈并抛出。 */
  async redo(): Promise<boolean> {
    const action = this.redoStack.pop();
    if (!action) return false;
    this.applying = true;
    try {
      await action.redo();
      this.undoStack.push(action);
    } catch (e) {
      this.redoStack.push(action);
      throw e;
    } finally {
      this.applying = false;
    }
    this.notify();
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
    this.notify();
  }

  setMaxHistory(n: number): void {
    const limit = Math.max(10, Math.min(500, Math.round(n)));
    this.maxHistory = limit;
    while (this.undoStack.length > limit) this.undoStack.shift();
    this.notify();
  }

  /** 订阅栈变化（UI 按钮启停用）。返回取消订阅函数。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const l of this.listeners) l();
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
