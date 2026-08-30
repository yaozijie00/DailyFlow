import { isValidCondition, type Condition } from "./conditionEngine";

/**
 * 成就定义：数据驱动。新增普通成就只需在 src/achievements/*.json 增加一条配置，
 * 无需修改 Pomodoro / Statistics / UI / 条件引擎。
 */
export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  /** lucide 图标名（UI 层映射到组件，未匹配回退默认图标） */
  icon: string;
  /** 分组：basic / productivity / category / special */
  category: string;
  condition: Condition;
  reward: string | null;
  hidden: boolean;
  enabled: boolean;
  /** 成就链 ID（渐进式解锁：同一 chainId 只显示当前下一个未解锁成就）；空 = 独立成就 */
  chainId: string | null;
  /** 成就链内顺序（升序；order 表示顺序而非条件目标值） */
  order: number;
}

// 打包时静态收集 src/achievements/*.json（每文件一个数组）
const files = import.meta.glob("./*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

/** 校验单条成就定义；非法返回 null（调用方跳过，不崩溃）。 */
export function validateDefinition(raw: unknown): AchievementDefinition | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== "string" || d.id.trim() === "") return null;
  if (typeof d.name !== "string" || d.name.trim() === "") return null;
  if (typeof d.description !== "string") return null;
  if (typeof d.icon !== "string" || d.icon.trim() === "") return null;
  if (!isValidCondition(d.condition)) return null;
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    icon: d.icon,
    category: typeof d.category === "string" && d.category.trim() ? d.category : "basic",
    condition: d.condition as Condition,
    reward: typeof d.reward === "string" ? d.reward : null,
    hidden: d.hidden === true,
    enabled: d.enabled !== false,
    chainId: typeof d.chainId === "string" && d.chainId.trim() ? d.chainId : null,
    order: typeof d.order === "number" && Number.isFinite(d.order) ? d.order : 0,
  };
}

/** 加载并校验全部成就定义；非法条目跳过并告警。 */
export function loadAchievementDefinitions(): AchievementDefinition[] {
  const result: AchievementDefinition[] = [];
  for (const [path, raw] of Object.entries(files)) {
    const list = Array.isArray(raw) ? raw : [];
    for (const item of list) {
      const def = validateDefinition(item);
      if (def) result.push(def);
      else console.warn(`[achievements] 跳过非法配置：${path}`);
    }
  }
  return result.filter((d) => d.enabled);
}
