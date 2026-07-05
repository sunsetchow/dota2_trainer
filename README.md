# Dota2 Trainer

Dota2 Trainer 是一个本地 Electron + React 训练闭环工具，面向 Dota 2 个人训练、英雄池管理、Draft 辅助、赛前计划、赛后复盘、数据导入和英雄笔记间隔复习。

当前版本：`0.3.2`

## 核心功能

### 训练闭环

- 每日训练打卡和连训 streak 跟踪。
- 训练周期 / 周目标管理。
- 赛前提醒：Draft 锁定英雄和敌方阵容后，展示英雄笔记和对位注意事项；不再重复选择英雄或训练目标。
- 赛后复盘：记录胜负、时长、目标完成度、最大错误、下一局重点。
- 历史记录和单局详情页。
- MMR 日志和趋势图。

### Draft 助手

- 基于个人英雄池、位置池、熟练度和敌方阵容给出推荐。
- 支持英雄启用 / 停用、主力 / 练习 / 备用分层。
- 每个英雄可配置可用位置；显式空位置数组会被视为用户意图，不回退默认池。
- 支持中文名、英文名和别名搜索。
- 点击推荐英雄会直接创建待关联的赛前记录，并进入赛前提醒页。
- 英雄 Timing Cache 计算前 / 中 / 后 / 大后期强势标签；配置了 Stratz API Key 时优先用 Stratz（一次请求拿全部英雄，更快），否则回退 OpenDota `/durations`；低样本阶段显示“数据少”或静默降级，不伪造 50% 胜率。
- Draft 右侧会在有缓存时展示“我的英雄 vs 敌方已知阵容时间线”，用于判断主要行动窗口。

### 赛前提醒

- 赛前页不再提供「开始游戏」按钮，也不再要求填写训练目标。
- Draft 是唯一的英雄/阵容决策入口；赛前页只消费 Draft 已锁定的信息。
- Draft 敌方阵容输入框使用稳定的建议下拉层；点击输入框会保持候选列表打开，选择项时不会被 blur 抢先关闭。
- Draft 敌方 1-5 号位输入框的默认提示会显示该位置当前 meta 最热门的 3 个英雄。
- 展示内容包括：
  - 已锁定英雄、目标位置、敌方 1-5 号位。
  - 当前英雄档案中的对线目标、关键装、强弱势期、常见死亡、打架/刷钱规则。
  - 用户维护的 `counters` / `counteredBy` / `reviewRules` 中命中敌方英雄的注意事项。
  - OpenDota / Stratz matchup cache 的对位优势/劣势和样本数；没有 cache 时回退本地克制表。
- `counteredBy` 是自由文本字段，不只是英雄列表。推荐每行写成「英雄名：具体打法提醒」，例如：`帕克：跳前先确认相位/沉默状态`。
- 新的 `matchupNotes` 是按对位英雄聚合的结构化记录，赛前提醒会优先读取它；`counters` / `counteredBy` 保留为兼容和快速编辑用的自由文本。

### 英雄中心 / 英雄笔记

- 统一管理英雄池、位置池、熟练度和英雄档案。
- 英雄池、赛前、赛后、英雄档案和 matchup 笔记会保存稳定 `heroId`，中文名继续用于展示；后续英雄改名不会让历史数据失联。
- 英雄档案字段包括：
  - 位置笔记
  - 第一件关键装
  - 强势期 / 弱势期
  - 对线目标
  - 常见死亡
  - 何时打架 / 何时刷钱
  - 克制 / 被克制
  - 复盘规则
  - 按对位英雄保存的结构化 matchup 笔记
- 赛后复盘可以邀请记录本局对位英雄心得，并沉淀回当前英雄档案：
  - “风险/被克制”会保存到结构化 `matchupNotes`，并同步到兼容文本字段 `counteredBy`。
  - “优势/克制”会保存到结构化 `matchupNotes`，并同步到兼容文本字段 `counters`。
  - “心得”只保存到结构化 `matchupNotes`，不污染 counters/counteredBy。
- 支持英雄笔记间隔复习（SRS）：
  - 没有排程的笔记按「首次复习」处理，会进入待复习列表。
  - 已排程笔记在 `srsNextReviewDate <= 今天` 时到期。
  - 评分按钮：`忘了` / `勉强` / `记得` / `很熟`。
  - 评分后会更新 `srsEase`、`srsIntervalDays`、`srsNextReviewDate` 和 `srsLastRating`。
  - 从首页「去复习」会跳到第一条到期英雄档案。
  - 复习完成后会自动切到下一条待复习英雄。

### OpenDota / Stratz 数据

- OpenDota Match ID 导入。
- OpenDota IPC 错误使用结构化 code（如 `PARSE_PENDING`、`RATE_LIMITED`、`TIMEOUT`），renderer 不再依赖中文错误文案 substring 判断是否继续轮询或显示“请求解析”。
- 自动同步最近一局未记录比赛；主进程会同时读取 renderer 传入列表和本地 `matchLogs`，避免赛后页初始加载竞态导致重复导入已记录比赛。
- 最近比赛列表会用同一套本地记录兜底标记已记录状态。
- 请求 OpenDota 解析并自动导入：点击后会先提交解析请求，等待 2 分钟后每 30 秒轮询一次 Match ID 导入，最多等到 5 分钟；拿到详细数据后会自动填入赛后表单，但仍需要手动保存复盘。
- OpenDota 导入会解析敌方 5 个英雄；即使没有从 Draft / 赛前链路进入赛后页，也会显示对位英雄笔记卡片。
- 稳定 `heroId` migration / 读写校验会把历史英文名（例如 `Largo`）规范化为当前中文显示名（例如 `朗戈`），避免赛后、历史、英雄池和 matchup cache 继续使用旧英文 key。
- 英雄 benchmark percentile enrichment。
- Stratz-only matchup cache 同步；OpenDota 不再作为 hero matchup 数据源。
- OpenDota durations / hero Timing Cache 同步，用于 Draft 强势期标签和时间线；不参与 matchup 分数。
- bundled matchup snapshot 冷启动兜底。

### 数据安全和备份

- 持久化数据使用 Zod runtime schema 校验。
- Electron IPC 写入前做 payload validation。
- 备份导入前校验完整 JSON shape，拒绝未知 top-level key 和坏数据。
- 备份导出会移除 API key 等敏感字段。
- 启动时会执行 v3 migration / recovery：核心数组逐条 salvage，坏条目丢弃且健康数据保留，并为旧的中文名 keyed 英雄数据补齐稳定 `heroId`。
- 坏 matchup / benchmark / timing cache 会自动清空为可重建状态，不会拖垮核心训练数据。
- 发生 destructive recovery 时会优先备份当前 store 为 `*.corrupt-YYYYMMDD-HHmmss.json`。
- 备份导入会先 migration / salvage 到当前 `schemaVersion`，再写入本地 store。

## 技术栈

- Electron
- electron-vite
- React 18
- React Router
- TypeScript
- Tailwind CSS
- electron-store
- Zod
- Vitest

## 项目结构

```text
electron/
  main.ts                         Electron app/window lifecycle 和启动 bootstrap
  store.ts                        electron-store 初始化和默认 schemaVersion
  ipc/
    storeIpc.ts                   store / backup IPC handlers + persisted store validation
    storeIpc.test.ts              store IPC validation helper regression tests
    opendotaIpc.ts                OpenDota / Stratz IPC handlers
  services/
    dotaDataServices.ts           OpenDota / Stratz API/service logic

src/
  app/
    AppShell.tsx                  应用壳和导航
  components/                     通用 UI、训练组件和 CompositionTimeline
  data/                           英雄、位置池、matchup snapshot、review dimensions
  features/
    heroNotes/
      HeroNoteReviewCard.tsx      英雄笔记复习评分卡
    postgame/
      focusSuggestions.ts         赛后 focus suggestion 纯逻辑
      matchLogBuilder.ts          MatchLog 构造逻辑
      OpenDotaImportPanel.tsx     赛后 OpenDota 导入面板
      SrsReviewPrompt.tsx         赛后相关英雄笔记复习提示
  pages/                          页面级 flow orchestration
  schema/
    persistence.ts                持久化 runtime schemas/parsers
    persistence.test.ts           schema/parser tests
  store/
    useStore.ts                   renderer store hooks
  utils/                          hero resolve / identity、Timing、SRS、cycle、OpenDota structured errors 等工具
```

## 本地开发

```bash
npm install
npm run dev
```

## 常用命令

```bash
# 单元测试
npm test

# TypeScript 类型检查
npx tsc --noEmit

# 生产构建
npm run build

# 校验位置英雄池
npm run validate:position-pools

# 校验位置 meta heroes
npm run validate:position-meta

# 校验 matchup snapshot 完整性
npm run validate:matchups

# 更新 matchup snapshot
npm run update:matchups

# 打包目录构建
npm run pack

# 分发构建
npm run dist
```

## 验证建议

提交前建议至少运行：

```bash
npm test
npx tsc --noEmit
npm run build
npm run validate:position-pools
npm run validate:position-meta
npm run validate:matchups
npm audit --omit=dev
git diff --check
```

## 数据和隐私

- 应用数据保存在本地 Electron store 中。
- OpenDota / Stratz 配置保存在本地。
- 备份导出会 redaction API key；不要把真实 token、API key 或私密配置提交到仓库。

## 维护约定

- 每次功能或行为改动都要同步更新 README。
- 改英雄中文名 / 别名时，需要同时检查：
  - `src/data/opendotaHeroes.json`
  - `src/data/heroes.json`
  - `src/data/positionHeroPools.json`
  - `src/data/heroMatchupSnapshot.json`
  - 相关 resolver / validation tests
- 改持久化数据结构时，需要同步更新：
  - `src/schema/persistence.ts`
  - schema tests
  - backup import/export 行为
  - migration / recovery 逻辑
- 改 Electron IPC 或 service 边界后，需要跑完整验证，确保 runtime validation 没丢。

## 最近重要改动

- 0.3.2：修正 `heroes.json` alias 表里三个英雄名字对错方向的 bug——杰奇洛/亚巴顿被错误 canonical 到不存在的"双头龙"/"阿巴顿"，天怒法师被错误指向另一个英雄 Arc Warden 的真名"天穹守望者"（已用 Stratz `constants.heroes(language: S_CHINESE)` 核实正确官方名）；受影响的本地 `counters`/`supMap` 对位数据之前因为 key 名字不对，在 Draft 打分里一直没被用上。修了英雄档案页切换英雄卡顿（`HeroCard` 加 `React.memo`，配合按英雄缓存的位置数组避免 prop 引用每次变化）。修了页面内容变高时整个窗口跟着滚动、连带侧边导航栏一起挪动的问题——`AppShell` 最外层容器改成固定 `h-[100dvh]`（原来是 `min-h-[100dvh]`，内容一高就跟着长高，导致溢出滚动被甩到整个文档而不是 `<main>` 内部）。
- Phase 29.3：位置热门英雄改为可实时同步（配置了 Stratz API Key 时）——`heroStats.stats(groupByPosition)` 一次请求拿全部 127 个英雄在 5 个位置的选取数据（实测约 0.75 秒），按位置内 pick 数排名取 Top 12，权重按 pick 数归一化到最热门英雄 = 1.0；沿用设置页里 matchup/timing 共用的单一 `rankBracket`。未配置 Stratz Key 时回退到仓库里手写的静态快照（`source: 'manual'`）。之前这块数据完全是每月手工维护的固定文件，从未接入过实时数据源。
- Phase 29.2：Timing 数据源改为优先 Stratz（配置了 Stratz API Key 时）——`heroStats.stats(groupByTime)` 一次请求拿全部 127 个英雄的分钟级数据（实测约 1.3 秒），相邻分钟做差分还原成和 OpenDota `/durations` 一致的离散分桶（Stratz 返回的是"对局时长 ≥ 该分钟"的累计生存计数，不能直接当离散分桶用）。未配置 Stratz Key 时回退到原有 OpenDota 逐英雄同步（已加限流重试）。
- Phase 29.1：Timing 同步加进度上报（无 API Key 时单个英雄请求可能要数秒，127 个英雄全量同步实测约 13-15 分钟，之前界面无进度提示容易被误认为卡死）；OpenDota 逐英雄同步遇到限流会重试（5s/15s）而不是直接放弃该英雄；英雄档案页新增 Timing 强势期展示。
- Phase 29：英雄 Timing Cache 接入 OpenDota `/durations`；Draft 显示强势期标签和“我的英雄 vs 敌方已知阵容时间线”，低样本阶段不参与强势期判断。
- 数据源策略：英雄 matchup 固定为 Stratz-only；Timing、位置热门英雄优先 Stratz、否则分别回退 OpenDota / 本地手写快照；OpenDota 仍用于 Match ID 导入和 benchmarks。
- Phase 1：Zod runtime schema、Vitest、backup/import validation、schemaVersion 地基。
- Phase 2：拆分 Electron main，抽出 store/openDota IPC 和 Dota data services。
- Phase 3：拆分 PostGame，抽出 postgame feature helpers/UI，并补测试。
- Phase 25：稳定 hero id 迁移，schemaVersion 升级到 v3；英雄池、赛前、赛后、英雄档案、matchupNotes 会补齐并持续写入 `heroId` / 对手 `heroId`，UI 查找支持 id 优先回退中文名。
- Phase 24：OpenDota IPC/service contract 收敛，导入错误改为结构化 code，renderer 不再依赖中文文案判断 parse pending / rate limit / timeout，并移除旧 `analyzeAndImportOpenDotaMatch` IPC 暴露。
- Phase 23：持久化韧性和 migration 地基，schemaVersion 升级到 v2，启动/备份导入支持 salvage、坏 store 备份和备份失败兜底。
- 英雄名修正：`Muerta` 显示为 `琼英碧灵`，别名包含 `穆尔塔` / `奶绿`；`Largo` 显示为 `朗戈`。
- 英雄笔记复习：采用方案 A，未排程笔记进入首次复习；英雄中心支持直接评分并自动跳到下一条待复习。
- Draft / 赛前职责拆分：Draft 负责锁英雄和阵容；赛前页只展示英雄笔记、用户维护对位提醒和数据 matchup 提示。
- 修复启动兼容性：持久化 schema 避免使用运行时不可用的 `z.partialRecord`，改用显式 1-5 号位对象。
- 英雄档案 / 赛后复盘联动：赛后可按对位英雄记录心得，并保存为结构化 matchup 笔记；赛前页会优先展示这些按英雄聚合的个人经验。
- 修复 Draft 敌方阵容下拉框偶发不弹出、赛前页遇到旧英雄笔记数据时黑屏的问题。
- Draft 敌方阵容输入框 placeholder 改为按位置显示前三个热门英雄。
