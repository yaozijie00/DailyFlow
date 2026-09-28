import { useEffect, useState } from "react";
import PlanningWorkspace, { planningWorkspaceService } from "../components/planning/PlanningWorkspace";
import { PhasePlan } from "../components/goals/LongTermPlanDetail";
import { useLongTermPlanStore } from "../stores/longTermPlanStore";
import { useGoalStore } from "../stores/goalStore";
import { useDataVersion } from "../lib/dataVersion";
import { bumpDataVersion } from "../lib/dataVersion";
import { weekOf } from "../lib/planningDates";
import type { GoalWithProgress, UpdateGoalInput } from "../db/repositories/goalRepository";

/** The workspace owns planning; the existing phase editor retains its data and actions. */
export default function Goals() {
  const selectedId = useLongTermPlanStore((state) => state.selectedPlanId);
  const phases = useLongTermPlanStore((state) => state.phases);
  const loading = useLongTermPlanStore((state) => state.loadingDetail);
  const goalVersion = useDataVersion("goal"), taskVersion = useDataVersion("task");
  const [plan, setPlan] = useState<GoalWithProgress | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setPlan(null); setError("");
    if (selectedId != null) void planningWorkspaceService.list(weekOf()).then((rows) => {
      if (!active) return;
      const found = rows.find((row) => row.kind === "plan" && row.id === selectedId)?.plan;
      if (found) setPlan(found); else setError("计划已不存在，请返回工作台。");
    }).catch(() => { if (active) setError("阶段加载失败，请返回工作台重试。"); });
    return () => { active = false; };
  }, [selectedId, goalVersion, taskVersion]);
  const select = useLongTermPlanStore.getState().selectPlan;
  if (selectedId == null) return <PlanningWorkspace onOpenPlan={(id) => void select(id)} />;
  const update = async (id: number, input: UpdateGoalInput) => {
    await useGoalStore.getState().update(id, input);
    await useLongTermPlanStore.getState().loadDetail(id);
    bumpDataVersion("goal");
  };
  return <div className="df-page-wide pw-workspace">
    <div className="pw-toolbar"><div><h1>{plan?.title ?? "计划阶段"}</h1><p className="pw-muted">把方向拆成可推进的阶段。</p></div><button onClick={() => void select(null)}>返回长期工作台</button></div>
    {error ? <p role="alert">{error}</p> : !plan || loading ? <p role="status">正在读取阶段…</p> : <PhasePlan plan={plan} phases={phases} onUpdate={(id, input) => void update(id, input)} />}
  </div>;
}
