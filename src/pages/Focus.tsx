import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useTaskStore } from "../stores/taskStore";
import { PageHeader } from "../components/ui/PageHeader";
import PomodoroPanel from "../components/pomodoro/PomodoroPanel";

export default function Focus() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const load = useTaskStore((s) => s.load);

  useEffect(() => {
    if (dbStatus === "ready") {
      load();
    }
  }, [dbStatus, load]);

  return (
    <div>
      <PageHeader
        title="专注"
        description="番茄钟：专注一个任务，完成后记录本次专注。"
      />
      <PomodoroPanel />
    </div>
  );
}
