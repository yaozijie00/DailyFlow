# DailyFlow 成就系统 / 游戏化调研报告

> 技术栈：Tauri 2 + React 19 + TS + Tailwind v4 + 自研 Event→Rule→Unlock 成就引擎
> 现状：61 条成就 / 13 分类 / 18 条渐进链 / 26 种条件算子（含 and/or/not），JSON 数据驱动，解锁 toast + 成就页（分类 tab、进度环）
> 调研方式：web_search 多轮；以下链接均来自实际检索结果。许可证标注「以仓库为准」者请核对仓库 LICENSE。

---

## 〇、结论速览

| 决策点 | 建议 |
|---|---|
| 引擎 | 自研 Rule 引擎已领先多数开源（npm achievements-engine 是最接近的对照物）；**无需换引擎**，可对照补算子 |
| 展示层 | **补 Trophy UI / shadcn 奖杯墙 + react-rewards / canvas-confetti 庆祝动效**（React19+Tailwind4 直接可用） |
| 成就清单 | 现有 61 条 → 按清单补 20-30 条到 90 条规模；先加 探索/隐藏/元 三类 tab UI 占位 |
| 设计红线 | 名称用「做了什么」Steam 式写法；隐藏成就可手动揭露；避免无意义滥发；大师层加非纯徽章奖励 |

---

## 一、游戏化框架理论（设计准则）

### 1.1 通用框架
- **[Octalysis 八面玲珑框架](https://foundersnetwork.com/octalysis-startup-gamification-framework/)**：8 个动机核心驱动。DailyFlow 对应：成就页=成就感、隐藏成就=未知/好奇、断签=损失规避。
- **[Why Most Gamification Badges Backfire（Yu-kai Chou 警示）](https://yukaichou.com/gamification-analysis/achievement-badge-design-gamification-backfire/)**：坏徽章=无意义滥发、与真实能力无关。**徽章要对应用户真实掌握的技能/里程碑**——正是 Rule 引擎「统计事实→解锁」的天然优势。
- **[FORGE 奖励组织框架（PMC 论文）](https://pmc.ncbi.nlm.nih.gov/articles/PMC12614482/)**：奖励分层（新手=纯徽章、进阶=徽章+数据页高亮、大师=主题/壁纸等）。
- **[游戏机制笔记 F_35 Achievement Systems](https://github.com/raduacg/game-mechanics-optimizations/blob/main/F_35_achievement_systems.md)** 与 **[G_03 Achievement Pop-Ups](https://github.com/raduacg/game-mechanics-optimizations/blob/main/G_03_achievement_pop_ups.md)**：可直接照抄的成就/解锁弹窗 UX 模式。
- **[GamiFIN：游戏元素如何结构化学习路径](https://dl.acm.org/doi/10.1145/3789624.3789648)**：简单透明的进度支架 + 双通道反馈最有效——支持进度环思路。

### 1.2 平台成就体系（Steam / Xbox）
- **[Steamworks Stats and Achievements](https://partner.steamgames.com/doc/features/achievements)**：命名/描述/图标规范，「统计字段驱动解锁」架构与 Rule 引擎同构。
- **[Xbox 按稀有度更换解锁音效](https://www.digitaltrends.com/gaming/xbox-new-achievement-sound/)**：不同 toast 样式区分 新手/进阶/大师/隐藏。
- **[Xbox 允许揭露隐藏成就](https://www.ign.com/articles/xbox-update-finally-lets-you-reveal-hidden-achievements)**：隐藏成就应有「查看提示/揭露」交互。
- **[什么算稀有成就](https://gaming.stackexchange.com/questions/291811/what-determines-if-an-achievement-is-a-rare-achievement)**：达成率阈值（如 <10% 稀有）——可加「成就率 xx%」标签。
- **[Kotaku：Halo 蠢成就的意义](https://kotaku.com/theres-actually-a-point-to-halos-dumbest-achievement-1658569483)**：每条规则系列留 1-2 个梗/彩蛋成就。
- **[独立游戏成就奖杯设计（中文）](https://plumephp.com/indie-game-achievement-trophy-design/)**：铜银金梯度、描述写法、避免无意义刷。

### 1.3 习惯/效率类 App 对标
- **Duolingo**：[成就条目](https://duolingo.fandom.com/wiki/Achievements) · [每日挑战](https://duolingo.fandom.com/wiki/Challenges)——里程碑+连续+每日 Quest 三轨并行。
- **Habitica（全开源）**：[成就 Wiki（中文）](https://habitica.fandom.com/zh/wiki/%E6%88%90%E5%B0%B1)——任务类成就绑「完成 N 个待办」，徽章墙展示。
- **Todoist Karma**：[积分等级体系](https://www.todoist.com/zh-CN/help/articles/introduction-to-karma-OgWkWy)——任务+经验+等级称号极简实现。
- **Forest**：[专注种树](https://play.google.com/store/apps/details?id=cc.forestapp)——专注时长→解锁收集物，可给大师层加主题/皮肤收集。
- **Beeminder**：[自我预测承诺机制](https://blog.beeminder.com/predict)——可做「预言达成率」探索成就。

---

## 二、开源实现（引擎 + 展示 + 标准）

### 2.1 引擎参考
| 项目 | 链接 | 说明 | 许可 | 契合度 |
|---|---|---|---|---|
| **gamification-engine (polymotto)** | https://github.com/polymotto/gamification-engine | Java 规则驱动游戏化框架（Points/Levels/Achievements/Rules） | 以仓库为准 | 中：架构理念同构，读其 rule 建模 |
| **JeJan/gamification-engine** | https://github.com/JeJan/gamification-engine | gengine 的 AGPL 维护版 | AGPL-3.0 | 中：AGPL 传染，只借鉴不引代码 |
| **achievements-engine（npm）** | [README](https://app.unpkg.com/achievements-engine@1.1.2/files/README.md) · [docs](https://dave-b-b.github.io/achievements-engine/docs/getting-started/) | Node 成就引擎，事件流判定解锁——与 DailyFlow Event→Rule→Unlock 逐字同构 | 以仓库为准 | **高**：引擎演进最佳参照 |
| **Habitica** | https://github.com/HabitRPG/habitica | 全开源 RPG 习惯应用，成就/奖励产品级样例 | GPL 系 | 中-高：命名/展示/任务绑定最贴近 |
| **badgr-ui** | https://github.com/open-educational-badges/badgr-ui | Open Badges 徽章墙前端 | 以仓库为准 | 低-中：借鉴徽章卡元数据展示 |
| **Open Badges 规范** | https://www.1edtech.org/standards/open-badges | issuer/badgeClass/assertion 三段 JSON | 开放 | 中：成就导出/分享卡可套其思想 |
| **GitHub topic: gamification** | https://repos.ecosyste.ms/hosts/GitHub/topics/gamification?order=desc&sort=stargazers_count | 按 star 排序候选索引 | — | 高：扩充候选入口 |

### 2.2 React 展示组件（可直接进前端）
| 项目 | 链接 | 说明 | 许可 | 契合度 |
|---|---|---|---|---|
| **trophyso/ui（Trophy UI）** | https://github.com/trophyso/ui · [介绍](https://trophy.so/blog/introducing-trophy-ui) | 官方开源游戏化组件库：AchievementCard/Grid/Leaderboard，[Demo](https://ui.trophy.so/docs/components/achievement-card) | 以仓库为准 | **高**：成就 UI 整包借鉴 |
| **shadcn Achievement Trophy Wall** | https://www.shadcn.io/view/features/achievement-trophy-wall | 奖杯墙成就展示块（与 React19+Tailwind4 同源） | MIT 体系 | **高**：UI 参考直接照抄改造 |
| **react-rewards** | https://github.com/zer0cache/react-rewards | 一行 API 触发 confetti/emoji 庆祝动画 | MIT | 高：解锁庆祝即插即用 |
| **canvas-confetti** | https://github.com/catdad/canvas-confetti | 高性能轻量 confetti | MIT | 高：自包解锁弹层 |

**小结**：引擎自研已领先；真正缺的是**展示层**——Trophy UI / shadcn 奖杯墙 + react-rewards 组合即可，无需引入外部整套引擎。

---

## 三、成就创意清单（45 条，可进 Rule JSON）

### 专注（番茄钟）
1. 初次入定 - 完成第 1 个番茄钟 - 新手
2. 专注十连 - 累计 10 个番茄钟 - 新手
3. 百钟达成 - 累计 100 个番茄钟 - 进阶
4. 千钟行者 - 累计 1000 个番茄钟 - 大师
5. 深水区 - 单次专注 ≥90 分钟且无打断 - 进阶
6. 马拉松选手 - 单次专注 ≥180 分钟 - 大师
7. 黄金一小时 - 连续 7 天在黄金时段开启首个专注 - 进阶
8. 早起鸟/夜猫子 - 7 天内 ≥5 次 06:00-09:00（或 21:00 后）开始 - 进阶（互斥）
9. 整日满贯 - 单日 ≥8 个番茄钟 - 进阶
10. 全周专注 - 一周 7 天每天有专注且日均 ≥2 钟 - 大师

### 任务
11. 首战告捷 - 完成第 1 个任务 - 新手
12. 百战成钢 - 累计 100 个任务 - 进阶
13. 千单通关 - 累计 1000 个任务 - 大师
14. 提前交付 - 提前 ≥24h 完成带截止任务 ×10 - 进阶
15. 零逾期一周 - 连续 7 天无逾期 - 进阶
16. 拆解大师 - 任务拆 ≥5 子任务并全完成（首次） - 进阶
17. 单日清仓 - 单日完成 ≥10 任务 - 新手
18. 重启的勇气 - 激活搁置 ≥7 天任务并完成 ×3 - 进阶
19. 高优先手 - 累计完成高优先级 ≥20 - 进阶

### 连续
20. 三日之约 - 连续 3 天 - 新手
21. 七日律动 - 连续 7 天 - 新手
22. 三十连击 - 连续 30 天 - 进阶
23. 百日传说 - 连续 100 天 - 大师
24. 从头再来 - 长连续断裂后 7 天内重开 ≥7 天新连续 - 隐藏
25. 同时刻怪人 - 连续 7 天同一小时段开始首次专注 - 隐藏

### 复盘
26. 首篇复盘 - 第 1 次日复盘 - 新手
27. 复盘七日 - 连续 7 天日复盘 - 进阶
28. 周而复始 - 累计 10 次周复盘 - 进阶
29. 三十日思 - 累计 30 次日复盘 - 进阶
30. 季度蓝图 - 季度复盘与下季规划 - 大师
31. 直面低谷 - 复盘中标记「未达成」≥15 次仍坚持 - 隐藏

### 课程
32. 开卷有益 - 完成第 1 个学习块 - 新手
33. 五小时学堂 - 累计学习 5h - 新手
34. 五十小时精进 - 累计 50h - 进阶
35. 学以致用 - 学完课程 3 天内完成关联任务 ×3 - 进阶
36. 温故知新 - 同一课程复习 ×10 - 进阶
37. 终身学习者 - 累计学习 300h - 大师

### 探索/隐藏/元/彩蛋
38. 规则定制者 - 自定义成就规则 ≥3 条 - 探索
39. 快捷键侠 - 使用 ≥15 个不同快捷键 - 隐藏
40. 夜半灵感 - 23:00-02:00 完成 ≥25min 专注且次日复盘 - 隐藏
41. 自我超越 - 单日番茄数破个人纪录且旧纪录 ≥8 - 隐藏（元）
42. 里程碑元年 - 使用满 365 天 - 大师
43. 初窥门径 - 累计解锁 ≥10 成就 - 元
44. 成就收藏家 - 累计解锁 ≥30 成就 - 元
45. 全成就（完结撒花） - 解锁全部非隐藏成就 - 传奇（预留）

**落地要点**：① 第 7/8/25 条需「开始专注时刻/时段」事件；② 第 40/41 条含时间窗/纪录语义，需扩展条件算子（window/record）；③ 隐藏成就给「查看提示」入口；④ 每条显示 counter/target 进度。

---

## 四、下一步建议（一句话）
1. **补展示层**：Trophy UI 或 shadcn 奖杯墙 + react-rewards 庆祝动效（React19+Tailwind4 直接用）。
2. **引擎参照**：对照 achievements-engine 规则 schema 自检，补 `window/时段/纪录型` 条件算子。
3. **清单落地**：45 条按分类 tab 填入现有引擎（补 20-30 条到 ~90），先加 探索/隐藏/元 tab UI 占位。
4. **设计红线**：Steam 式描述、隐藏可揭露、避免滥发、大师层加非纯徽章奖励（主题/壁纸，FORGE 分层）。

---
*本文件所有链接来自 web_search 实际返回结果，未臆造 URL。*
