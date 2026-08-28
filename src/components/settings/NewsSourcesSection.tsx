import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useNewsStore, NEWS_CATEGORIES } from "../../stores/newsStore";
import { useSettingsStore } from "../../stores/settingsStore";

export default function NewsSourcesSection() {
  const sources = useNewsStore((s) => s.sources);
  const loadSources = useNewsStore((s) => s.loadSources);
  const validateSource = useNewsStore((s) => s.validateSource);
  const createSource = useNewsStore((s) => s.createSource);
  const updateSource = useNewsStore((s) => s.updateSource);
  const deleteSource = useNewsStore((s) => s.deleteSource);
  const toggleSource = useNewsStore((s) => s.toggleSource);
  const reorderSources = useNewsStore((s) => s.reorderSources);
  const newsRefreshIntervalMinutes = useSettingsStore(
    (s) => s.settings.newsRefreshIntervalMinutes,
  );
  const updateSettings = useSettingsStore((s) => s.update);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>(NEWS_CATEGORIES[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editCategory, setEditCategory] = useState<string>("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [interval, setIntervalDraft] = useState(String(newsRefreshIntervalMinutes));
  const [validating, setValidating] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const enabledCount = sources.filter((s) => s.enabled).length;

  /** 校验 URL 是否为可解析的 RSS/Atom；失败返回 false 并提示。 */
  async function ensureValidFeed(u: string): Promise<boolean> {
    setValidating(true);
    setFeedError(null);
    const result = await validateSource(u);
    setValidating(false);
    if (result === "ok") return true;
    setFeedError(
      result === "not_feed"
        ? "无法识别 RSS/Atom Feed"
        : "无法连接该地址，请检查网络或 URL",
    );
    return false;
  }

  const handleAdd = async () => {
    const n = name.trim();
    const u = url.trim();
    if (!n || !u) return;
    if (!(await ensureValidFeed(u))) return;
    await createSource({ name: n, url: u, category });
    setName("");
    setUrl("");
    setCategory(NEWS_CATEGORIES[0]);
  };

  const handleSaveEdit = async (id: number) => {
    const n = editName.trim();
    const u = editUrl.trim();
    if (!n || !u) return;
    if (!(await ensureValidFeed(u))) return;
    await updateSource(id, { name: n, url: u, category: editCategory });
    setEditingId(null);
  };

  const handleSaveInterval = async () => {
    const n = Number(interval);
    if (!Number.isFinite(n) || n < 5) return;
    await updateSettings({ newsRefreshIntervalMinutes: Math.round(n) });
  };

  return (
    <div className="space-y-3 rounded-md border border-neutral-200 bg-white p-5">
      {/* 刷新间隔 */}
      <div className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-3">
        <div>
          <div className="text-sm text-neutral-700">自动刷新间隔</div>
          <div className="text-xs text-neutral-400">打开新闻页后按此间隔自动刷新</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={5}
            value={interval}
            onChange={(e) => setIntervalDraft(e.target.value)}
            className="w-20 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-neutral-500">分钟</span>
          <button
            onClick={handleSaveInterval}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700"
          >
            保存
          </button>
        </div>
      </div>

      {/* 源列表 */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">
          已启用 {enabledCount} / {sources.length} 个源
        </div>
      </div>
      {sources.length === 0 && <p className="py-2 text-sm text-neutral-400">暂无新闻源</p>}
      {sources.map((s, idx) => (
        <div key={s.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={() => toggleSource(s.id)}
            title={s.enabled ? "禁用" : "启用"}
            className="h-4 w-4 shrink-0"
          />

          {editingId === s.id ? (
            <>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="名称"
                className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <input
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="RSS URL"
                className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
              >
                {NEWS_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span
                className={`w-32 truncate text-sm ${s.enabled ? "text-neutral-700" : "text-neutral-400 line-through"}`}
                title={s.name}
              >
                {s.name}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-400"
                title={s.url}
              >
                {s.url}
              </span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                {s.category}
              </span>
            </>
          )}

          <button
            onClick={() => reorderSources(move(sources, idx, idx - 1))}
            disabled={idx === 0}
            className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
            aria-label="上移"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => reorderSources(move(sources, idx, idx + 1))}
            disabled={idx === sources.length - 1}
            className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
            aria-label="下移"
          >
            <ArrowDown size={14} />
          </button>

          {editingId === s.id ? (
            <button
              onClick={() => void handleSaveEdit(s.id)}
              disabled={validating}
              className="rounded-md bg-neutral-900 px-2 py-1.5 text-xs text-white disabled:bg-neutral-300"
            >
              保存
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingId(s.id);
                setEditName(s.name);
                setEditUrl(s.url);
                setEditCategory(s.category);
                setFeedError(null);
              }}
              className="rounded-md border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100"
              aria-label="编辑"
            >
              <Pencil size={14} />
            </button>
          )}

          <button
            onClick={() => setConfirmDeleteId(s.id)}
            className="rounded-md border border-neutral-200 p-1.5 text-red-500 hover:bg-red-50"
            aria-label="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {confirmDeleteId != null && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>删除该新闻源不会删除已缓存新闻。确定删除？</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                void deleteSource(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs text-white"
            >
              确认删除
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 新增源 */}
      <div className="border-t border-neutral-100 pt-3">
        <div className="mb-2 text-sm font-medium text-neutral-700">添加 RSS 源</div>
        <div className="flex items-center gap-2">
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setFeedError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
            placeholder="粘贴 RSS / Atom URL"
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名称"
            className="w-32 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {NEWS_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!name.trim() || !url.trim() || validating}
            className="flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:bg-neutral-300"
          >
            <Plus size={14} /> {validating ? "验证中…" : "新增"}
          </button>
        </div>
        {feedError && <p className="mt-1 text-xs text-red-600">{feedError}</p>}
      </div>
    </div>
  );
}

/** 返回交换 idx 与 target 后重新排列的 id 列表（用于上移/下移）。 */
function move(list: { id: number }[], idx: number, target: number): number[] {
  if (target < 0 || target >= list.length) return list.map((s) => s.id);
  const ids = list.map((s) => s.id);
  [ids[idx], ids[target]] = [ids[target], ids[idx]];
  return ids;
}
