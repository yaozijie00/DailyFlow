import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useTaskStore } from "../stores/taskStore";
import { PageHeader } from "../components/ui/PageHeader";
import PomodoroPanel from "../components/pomodoro/PomodoroPanel";

export default function Focus() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const loadToday = useTaskStore((s) => s.loadToday);

  useEffect(() => {
    if (dbStatus === "ready") {
      loadToday();
    }
  }, [dbStatus, loadToday]);

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
