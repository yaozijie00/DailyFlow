import {
  Flag,
  Timer,
  Trophy,
  Flame,
  CalendarCheck,
  Zap,
  Layers,
  Code,
  BookOpen,
  Award,
  Medal,
  Gauge,
  Star,
  Target,
  Sun,
  type LucideIcon,
} from "lucide-react";

/** 成就配置里的 icon 名 → lucide 组件；未匹配回退 Trophy。 */
const ICONS: Record<string, LucideIcon> = {
  Flag,
  Timer,
  Trophy,
  Flame,
  CalendarCheck,
  Zap,
  Layers,
  Code,
  BookOpen,
  Award,
  Medal,
  Gauge,
  Star,
  Target,
  Sun,
};

export function AchievementIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Trophy;
  return <Icon size={size} />;
}
