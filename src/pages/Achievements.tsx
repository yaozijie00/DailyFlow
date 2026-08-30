import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { useAppStore } from "../stores/appStore";
import {
  useAchievementStore,
  type AchievementFilter,
} from "../stores/achievementStore";
import type { AchievementProgressView } from "../services/achievementService";
import { PageHeader } from "../components/ui/PageHeader";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { AchievementIcon } from "../components/achievements/AchievementIcon";
import { formatProgress, formatDurationCompact } from "../lib/format";

const FILTERS: { key: AchievementFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unlocked", label: "已解锁" },
];

function remainingText(a: AchievementProgressView): string {
  const left = Math.max(0, a.target - a.current);
  switch (a.unit) {
    case "minutes":
      return `还差 ${formatDurationCompact(left * 60)}`;
    case "days":
      return `还差 ${Math.round(left)} 天`;
    default:
      return `还差 ${Math.round(left)} 次`;
  }
}

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div
        className="h-full rounded-full bg-neutral-900"
        style={{ width: `${Math.max(2, percentage)}%` }}
      />
    </div>
  );
}

function AchievementCard({
  item,
  onOpen,
}: {
  item: AchievementProgressView;
  onOpen: () => void;
}) {
  const hidden = item.hidden && !item.unlocked;
  return (
    <button
      onClick={onOpen}
      className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
            item.unlocked ? "bg-amber-100 text-amber-600" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {hidden ? <Trophy size={18} /> : <AchievementIcon name={item.icon} size={18} />}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-neutral-900">
            {hidden ? "？？？" : item.name}
          </div>
          <div className="truncate text-xs text-neutral-500">
            {hidden ? "达成后揭晓" : item.description}
          </div>
        </div>
      </div>

      {item.unlocked ? (
        <div className="text-xs font-medium text-amber-600">✓ 已解锁</div>
      ) : (
        <div className="space-y-1">
          <ProgressBar percentage={item.percentage} />
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span className="tabular-nums">
              {formatProgress(item.current, item.target, item.unit)}
            </span>
            <span className="tabular-nums">{item.percentage}%</span>
          </div>
        </div>
      )}
    </button>
  );
}

export default function Achievements() {
  const dbStatus = useAppStore((s) => s.dbStatus);
  const items = useAchievementStore((s) => s.items);
  const loading = useAchievementStore((s) => s.loading);
  const filter = useAchievementStore((s) => s.filter);
  const setFilter = useAchievementStore((s) => s.setFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (dbStatus === "ready") {
      void useAchievementStore.getState().load();
    }
  }, [dbStatus]);

  const unlockedCount = items.filter((i) => i.unlocked).length;
  const visible = filter === "unlocked" ? items.filter((i) => i.unlocked) : items;
  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="成就"
        description={`已解锁 ${unlockedCount}`}
      />

      {/* 过滤 */}
      <div className="flex rounded-md border border-neutral-200 bg-white p-0.5 self-start">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              filter === f.key
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="text-sm text-neutral-400">加载中…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Trophy size={28} />}
          title="暂无成就"
          description="完成番茄钟后，这里会解锁你的成就。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <AchievementCard
              key={item.id}
              item={item}
              onOpen={() => setSelectedId(item.id)}
            />
          ))}
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={selected != null} onClose={() => setSelectedId(null)} title="成就详情">
        {selected && (
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-full ${
                selected.unlocked ? "bg-amber-100 text-amber-600" : "bg-neutral-100 text-neutral-500"
              }`}
            >
              <AchievementIcon name={selected.icon} size={30} />
            </span>
            <div>
              <div className="text-lg font-semibold text-neutral-900">{selected.name}</div>
              <p className="mt-1 text-sm text-neutral-500">{selected.description}</p>
            </div>

            {selected.unlocked ? (
              <div className="text-sm font-medium text-amber-600">✓ 已解锁</div>
            ) : (
              <div className="w-full max-w-xs space-y-2">
                <ProgressBar percentage={selected.percentage} />
                <div className="flex items-center justify-between text-sm text-neutral-600">
                  <span className="tabular-nums">
                    {formatProgress(selected.current, selected.target, selected.unit)}
                  </span>
                  <span className="tabular-nums">{selected.percentage}%</span>
                </div>
                <div className="text-xs text-neutral-400">{remainingText(selected)}</div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
