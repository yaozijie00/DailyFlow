import { undoManager } from "./undoManager";
import { useAppStore } from "../stores/appStore";
import { useTaskStore } from "../stores/taskStore";
import { useNoteStore } from "../stores/noteStore";
import { useGoalStore } from "../stores/goalStore";

/**
 * 撤销/重做的统一入口（按钮与快捷键共用）：
 * - Undo/Redo 成功后刷新受影响 Store（任务/便签/长期目标），保证
 *   Undo → SQLite → Store → UI 全链路同步（v1.6.2，修复撤销后 UI 不刷新的缺口）；
 * - 成功用动作 label 弹 Toast（已撤销：… / 已重做：…）；
 * - 失败不移动栈，提示「数据没有改变」，与 undoManager 语义一致。
 */

function refreshAffectedStores(): void {
  if (useAppStore.getState().dbStatus !== "ready") return;
  // 逐项 try：测试环境/边缘状态下个别 Store 可能缺失，失败不影响其余刷新
  try {
    const s = useTaskStore.getState();
    void s.load();
    if (typeof s.loadOverdue === "function") void s.loadOverdue();
  } catch {
    /* ignore */
  }
  try {
    void useNoteStore.getState().load();
  } catch {
    /* ignore */
  }
  try {
    void useGoalStore.getState().load();
  } catch {
    /* ignore */
  }
}

export async function performUndo(): Promise<void> {
  const app = useAppStore.getState();
  try {
    const ok = await undoManager.undo();
    if (!ok) return;
    refreshAffectedStores();
    app.pushToast("success", undoManager.lastLabel ? `已撤销：${undoManager.lastLabel}` : "已撤销");
  } catch {
    app.pushToast("error", "撤销失败，数据没有改变，请重试");
  }
}

export async function performRedo(): Promise<void> {
  const app = useAppStore.getState();
  try {
    const ok = await undoManager.redo();
    if (!ok) return;
    refreshAffectedStores();
    app.pushToast("success", undoManager.lastLabel ? `已重做：${undoManager.lastLabel}` : "已重做");
  } catch {
    app.pushToast("error", "重做失败，数据没有改变，请重试");
  }
}
