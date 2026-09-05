/** 成就解锁庆祝彩屑（轻量 canvas-confetti；失败静默不影响解锁流程）。 */

/** 动态加载 canvas-confetti 并触发一次温和的彩屑（顶部中央 + 右上层次）。 */
export function celebrateUnlock(): void {
  try {
    void import("canvas-confetti").then((m) => {
      const fire = m.default;
      void fire({
        particleCount: 90,
        spread: 70,
        startVelocity: 32,
        origin: { x: 0.5, y: 0.25 },
        colors: ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899"],
        disableForReducedMotion: true,
      });
      void fire({
        particleCount: 40,
        angle: 60,
        spread: 55,
        startVelocity: 40,
        origin: { x: 0.9, y: 0.2 },
        colors: ["#4f46e5", "#f59e0b", "#ec4899"],
        disableForReducedMotion: true,
      });
    });
  } catch {
    /* 忽略：彩屑仅是庆祝增强 */
  }
}
