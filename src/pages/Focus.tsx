import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import { useTaskStore } from "../stores/taskStore";
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
      <header className="mb-4">
        <h1 className="text-xl font-semibold">专注</h1>
        <p className="text-sm text-neutral-500">番茄钟：专注一个任务，完成后记录本次专注。</p>
      </header>
      <PomodoroPanel />
    </div>
  );
}
