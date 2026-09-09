import { useSyncExternalStore } from "react";

/**
 * 极简「数据域版本」失效总线（A1-P0Fix-④）：
 * - 写操作完成后 bump 对应域版本（任务/专注/便签/目标/项目/课程）；
 * - 派生视图（统计、成就、周进度、项目摘要等）订阅域版本变化后自行 reload；
 * - 不替代各 store 自身的 load 刷新（写侧 store 仍自刷），只解决
 *   「页面停留期间后台事件（专注完成/任务变化/撤销）使派生视图陈旧」的问题。
 *
 * 用法（写侧）：bumpDataVersion("task")   —— taskStore 写成功 / undoActions 撤销后
 * 用法（读侧）：useDataVersion("task")    —— 组件内随版本变化触发 reload
 */
export type DataDomain = "task" | "focus" | "note" | "goal" | "project" | "course" | "settings";

const versions: Record<DataDomain, number> = {
  task: 0,
  focus: 0,
  note: 0,
  goal: 0,
  project: 0,
  course: 0,
  settings: 0,
};

const listeners = new Map<DataDomain, Set<() => void>>();

function listenersOf(domain: DataDomain): Set<() => void> {
  let set = listeners.get(domain);
  if (!set) {
    set = new Set();
    listeners.set(domain, set);
  }
  return set;
}

/** 写操作完成后调用：使订阅该域的派生视图失效（幂等，重复 bump 无害）。 */
export function bumpDataVersion(domain: DataDomain): void {
  versions[domain] += 1;
  for (const fn of listenersOf(domain)) fn();
}

/** 读当前版本（React 订阅用，勿在渲染外调用）。 */
export function getDataVersion(domain: DataDomain): number {
  return versions[domain];
}

/** 非 React 订阅入口，供 Extension Context 与后台服务使用。 */
export function subscribeDataVersion(domain: DataDomain, listener: () => void): () => void {
  listenersOf(domain).add(listener);
  return () => {
    listenersOf(domain).delete(listener);
  };
}

/** React Hook：订阅某域版本；版本变化触发重渲染（组件 effect 里据此 reload）。 */
export function useDataVersion(domain: DataDomain): number {
  return useSyncExternalStore(
    (cb) => subscribeDataVersion(domain, cb),
    () => versions[domain],
  );
}
