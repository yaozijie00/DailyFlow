import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useTaskStore } from "../../stores/taskStore";
import { CATEGORY_COLORS, NO_CATEGORY_COLOR } from "../../lib/categoryColors";

export default function CategoriesSection() {
  const categories = useTaskStore((s) => s.categories);
  const createCategory = useTaskStore((s) => s.createCategory);
  const renameCategory = useTaskStore((s) => s.renameCategory);
  const deleteCategory = useTaskStore((s) => s.deleteCategory);
  const moveCategory = useTaskStore((s) => s.moveCategory);
  const changeCategoryColor = useTaskStore((s) => s.changeCategoryColor);

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [colorOpenId, setColorOpenId] = useState<number | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createCategory(name);
    setNewName("");
  };

  const handleRename = async (id: number) => {
    const name = editName.trim();
    if (!name) return;
    await renameCategory(id, name);
    setEditingId(null);
  };

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface p-5">
      {categories.map((c, idx) => (
        <div key={c.id} className="flex items-center gap-2">
          {editingId === c.id ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRename(c.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="flex-1 rounded-md border border-line-strong px-2 py-1.5 text-sm"
            />
          ) : (
            <span className="flex-1 text-sm text-ink">{c.name}</span>
          )}

          <button
            onClick={() => setColorOpenId(colorOpenId === c.id ? null : c.id)}
            className="h-5 w-5 shrink-0 rounded-full border border-line-strong"
            style={{ background: c.color ?? NO_CATEGORY_COLOR }}
            aria-label="设置分类颜色"
            title="设置分类颜色"
          />

          <button
            onClick={() => moveCategory(c.id, -1)}
            disabled={idx === 0}
            className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-canvas disabled:opacity-30"
            aria-label="上移"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => moveCategory(c.id, 1)}
            disabled={idx === categories.length - 1}
            className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-canvas disabled:opacity-30"
            aria-label="下移"
          >
            <ArrowDown size={14} />
          </button>

          {editingId === c.id ? (
            <button
              onClick={() => void handleRename(c.id)}
              className="rounded-md bg-brand px-2 py-1.5 text-xs text-white"
            >
              保存
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingId(c.id);
                setEditName(c.name);
              }}
              className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-canvas"
              aria-label="改名"
            >
              <Pencil size={14} />
            </button>
          )}

          <button
            onClick={() => setConfirmDeleteId(c.id)}
            className="rounded-md border border-line p-1.5 text-error hover:bg-error/10"
            aria-label="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {colorOpenId != null && (
        <div className="rounded-md border border-line bg-raised p-2">
          <div className="mb-1.5 flex items-center gap-1">
            {CATEGORY_COLORS.map((col) => (
              <button
                key={col}
                onClick={() => {
                  void changeCategoryColor(colorOpenId, col);
                  setColorOpenId(null);
                }}
                className="h-5 w-5 rounded-full border border-line-strong"
                style={{ background: col }}
                aria-label={col}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-2">自定义</span>
            <input
              type="color"
              value={categories.find((c) => c.id === colorOpenId)?.color ?? NO_CATEGORY_COLOR}
              onChange={(e) => void changeCategoryColor(colorOpenId, e.target.value)}
              className="h-6 w-10 cursor-pointer"
            />
          </div>
        </div>
      )}

      {confirmDeleteId != null && (
        <div className="rounded-md border border-warn/50 bg-warn/10 p-3 text-sm text-warn">
          <p>删除该分类后，属于它的任务不会被删除，但会变成「无分类」。确定删除？</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                void deleteCategory(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs text-white"
            >
              确认删除
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line-soft pt-3">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
          placeholder="新分类名称"
          className="flex-1 rounded-md border border-line-strong px-2 py-1.5 text-sm"
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          className="flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:bg-line"
        >
          <Plus size={14} /> 新增
        </button>
      </div>
    </div>
  );
}
