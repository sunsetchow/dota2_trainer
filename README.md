# Dota2 Trainer

Dota2 Trainer 是一个本地 Electron + React 训练闭环工具，面向 Dota 2 个人训练、英雄池管理、Draft 辅助、赛前计划、赛后复盘、数据导入和英雄笔记间隔复习。

当前版本：`0.2.4`

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

### 赛前提醒

- 赛前页不再提供「开始游戏」按钮，也不再要求填写训练目标。
- Draft 是唯一的英雄/阵容决策入口；赛前页只消费 Draft 已锁定的信息。
- 展示内容包括：
  - 已锁定英雄、目标位置、敌方 1-5 号位。
  - 当前英雄档案中的对线目标、关键装、强弱势期、常见死亡、打架/刷钱规则。
  - 用户维护的 `counters` / `counteredBy` / `reviewRules` 中命中敌方英雄的注意事项。
  - OpenDota / Stratz matchup cache 的对位优势/劣势和样本数；没有 cache 时回退本地克制表。
- `counteredBy` 是自由文本字段，不只是英雄列表。推荐每行写成「英雄名：具体打法提醒」，例如：`帕克：跳前先确认相位/沉默状态`。

### 英雄中心 / 英雄笔记

- 统一管理英雄池、位置池、熟练度和英雄档案。
- 英雄档案字段包括：
  - 位置笔记
  - 第一件关键装
  - 强势期 / 弱势期
  - 对线目标
  - 常见死亡
  - 何时打架 / 何时刷钱
  - 克制 / 被克制
  - 复盘规则
- 支持英雄笔记间隔复习（SRS）：
  - 没有排程的笔记按「首次复习」处理，会进入待复习列表。
  - 已排程笔记在 `srsNextReviewDate <= 今天` 时到期。
  - 评分按钮：`忘了` / `勉强` / `记得` / `很熟`。
  - 评分后会更新 `srsEase`、`srsIntervalDays`、`srsNextReviewDate` 和 `srsLastRating`。
  - 从首页「去复习」会跳到第一条到期英雄档案。
  - 复习完成后会自动切到下一条待复习英雄。

### OpenDota / Stratz 数据

- OpenDota Match ID 导入。
- 自动同步最近一局未记录比赛。
- 最近比赛列表。
- 请求 OpenDota 解析并自动导入。
- 英雄 benchmark percentile enrichment。
- OpenDota / Stratz matchup cache 同步。
- bundled matchup snapshot 冷启动兜底。

### 数据安全和备份

- 持久化数据使用 Zod runtime schema 校验。
- Electron IPC 写入前做 payload validation。
- 备份导入前校验完整 JSON shape，拒绝未知 top-level key 和坏数据。
- 备份导出会移除 API key 等敏感字段。
- 启动时会校验 / 恢复可选 cache：坏 matchup / benchmark cache 不会拖垮核心训练数据。
- `schemaVersion` 已接入启动校验和迁移入口。

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
  components/                     通用 UI 和训练组件
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
  utils/                          hero resolve、SRS、cycle、heroPool 等工具
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

- Phase 1：Zod runtime schema、Vitest、backup/import validation、schemaVersion 地基。
- Phase 2：拆分 Electron main，抽出 store/openDota IPC 和 Dota data services。
- Phase 3：拆分 PostGame，抽出 postgame feature helpers/UI，并补测试。
- 英雄名修正：`Muerta` 显示为 `琼英碧灵`，别名包含 `穆尔塔` / `奶绿`；`Largo` 显示为 `朗戈`。
- 英雄笔记复习：采用方案 A，未排程笔记进入首次复习；英雄中心支持直接评分并自动跳到下一条待复习。
- Draft / 赛前职责拆分：Draft 负责锁英雄和阵容；赛前页只展示英雄笔记、用户维护对位提醒和数据 matchup 提示。
