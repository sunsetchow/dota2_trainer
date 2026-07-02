# Implementation Plan

本计划根据 2026-07 Claude Code / `claude-fable-5` 项目架构 review 更新。目标是先降低数据损坏和升级失败风险，再收敛 IPC / schema 契约，最后处理 renderer 分层和英雄主键这类中长期架构债。

## 当前架构风险摘要

| 优先级 | 问题 | 影响 |
|---|---|---|
| Critical | 核心持久化数据校验失败可能阻止 app 启动 | 用户本地数据一旦有坏条目，窗口可能无法创建 |
| High | `schemaVersion` 只有标记，没有逐版本 migration | 下次数据结构演进或降级使用时风险高 |
| High | OpenDota / IPC 错误分类依赖中文文案匹配 | 改提示文案可能破坏重试、解析等待、导入流程 |
| High | `analyzeAndImportOpenDotaMatch` 旧 IPC 通道残留 | 两套轮询策略并存，维护者容易改错路径 |
| High | 持久化层以中文英雄名作为主键 | 英雄改名会让历史笔记、SRS、英雄池、对局记录变成孤儿 |
| Medium | Zod schema、TS interface、preload contract 三处手写 | 类型 / runtime contract 容易漂移 |
| Medium | Renderer hooks 各自维护副本，无共享状态层 | 跨页联动和实时刷新会越来越脆 |
| Medium | `PostGame.tsx` 仍承担过多编排职责 | OpenDota、SRS、matchup notes、保存流程耦合在页面里 |

---

## Phase A — 持久化韧性和 migration 地基（最高优先级）

### 目标

确保本地 store 即使部分损坏，应用也能启动；为未来 schema 变更建立可测试、可回滚的 migration 入口。

### 范围

1. **启动校验安全降级**
   - 在 `electron/main.ts` 调用 `validateAndMigratePersistedStore()` 时包 `try/catch`。
   - 如果核心 store 校验失败：
     - 备份当前 store 文件为 `*.corrupt-YYYYMMDD-HHmmss.json`。
     - 尽量 salvage 可解析的数据。
     - 最差情况下重建默认 store，保证窗口能打开。
   - 在 UI 或 console 给出明确恢复信息。

2. **核心数组逐条 salvage**
   - 对这些数组逐条 `safeParse`，坏条目丢弃并计数：
     - `matchLogs`
     - `preGameSetups`
     - `dailyCheckins`
     - `mmrLogs`
     - `heroNotes`
     - `cycles`
   - 可选 cache 仍可整块清空：
     - `heroMatchupCache`
     - `heroBenchmarkCache`

3. **真正的 migration 框架**
   - 新增类似：
     ```ts
     const CURRENT_SCHEMA_VERSION = 2
     const migrations: Record<number, (data: unknown) => unknown> = {
       1: migrateV1ToV2,
     }
     ```
   - 启动和 backup import 都走同一套 `migratePersistedData()`。
   - migration 必须可重复测试。

4. **v2 migration 试点**
   - 选择一个低风险变更验证框架：
     - 删除或不再要求 `appState.currentStreak` / `appState.longestStreak` 这两个死字段；或
     - 保留字段但用 migration 自动补齐缺失值并标记 v2。

5. **读写 schema 策略分离**
   - 写路径继续 strict，拒绝未知字段。
   - 读路径 / migration 前置解析考虑 `strip` 或分层 safe parse，避免旧/新字段导致整库不可读。

### 验收标准

- 手工往 store JSON 中加入：
  - 一条坏 `matchLog`；
  - 一个未知字段；
  - 一个坏 optional cache；
  应用仍能启动，健康数据仍可读取。
- 新增测试覆盖：
  - 坏核心数组条目被丢弃，其余保留；
  - 坏 cache 被清空但不影响核心数据；
  - v1 backup import 自动迁移到 v2；
  - migration 重复执行不破坏数据。
- 验证命令：
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

---

## Phase B — IPC / service contract 收敛

### 目标

消除错误文案驱动业务逻辑和死 IPC 通道；让 OpenDota / Stratz service 更可测试。

### 范围

1. **结构化 IPC 错误协议**
   - 定义统一错误 code：
     ```ts
     type OpenDotaErrorCode =
       | 'PARSE_PENDING'
       | 'MATCH_NOT_FOUND'
       | 'RATE_LIMITED'
       | 'TIMEOUT'
       | 'ACCOUNT_MISMATCH'
       | 'INVALID_MATCH_ID'
       | 'UNKNOWN'
     ```
   - main process 抛出或返回 `{ code, message }`。
   - renderer 不再用 `message.includes(...)` 分支。

2. **统一 OpenDota 解析 + 轮询路径**
   - 删除死通道：`analyzeAndImportOpenDotaMatch`；或
   - 把当前「先等 2 分钟，再每 30 秒到 5 分钟」策略下沉回 main process。
   - 若下沉到 main：通过 IPC progress event 通知 renderer：
     - submitted
     - waiting
     - polling attempt x/y
     - imported
     - failed
     - cancelled

3. **service 真正依赖注入**
   - 将 `electron/services/dotaDataServices.ts` 改为：
     ```ts
     createDotaDataServices({ store, fetchImpl, clock })
     ```
   - 避免 service 内部直接 import store 单例。
   - 为网络重试、benchmark cache 写回、enemyHeroes 解析补 service tests。

4. **IPC contract 类型收敛**
   - 定义共享 `ElectronStoreApi` / `IpcContract` 类型。
   - 同时约束：
     - preload expose
     - Window declaration
     - renderer 调用
     - IPC handler 返回值

### 验收标准

- 改任意中文错误文案，不影响 parse pending / rate limit / timeout 分支测试。
- grep 不再出现业务逻辑中的 `message.includes('解析')`。
- 旧 `analyzeAndImportOpenDotaMatch` 死通道已删除或被唯一主路径使用。
- service tests 可在无真实网络情况下覆盖 OpenDota import flow。

---

## Phase C — Type/schema 单一真源

### 目标

减少 Zod schema、TypeScript interface、IPC preload 声明之间的人肉同步。

### 范围

1. **从 Zod 推导持久化类型**
   - 对持久化实体逐步改成：
     ```ts
     export type MatchLog = z.infer<typeof MatchLogSchema>
     ```
   - 删除 parser 后的无意义 `as MatchLog` 强转。

2. **schema 分层**
   - 将 runtime schema 拆分为：
     - domain schema
     - import/export schema
     - patch schema
     - migration schema
   - 避免单个 `persistence.ts` 无限膨胀。

3. **测试 contract drift**
   - 增加 compile-time 或 runtime smoke tests，确保 schema/type/preload API 不漂移。

### 验收标准

- 新增持久化字段时，至少有一处类型或测试能强制提醒同步 IPC / schema / backup。
- `src/types/index.ts` 明显瘦身，不再同时承担 domain types + Window API + external API types。

---

## Phase D — Renderer 状态和 PostGame 分层

### 目标

降低页面组件复杂度，让跨页数据同步更可靠。

### 范围

1. **共享 renderer store**
   - 用 zustand 或轻量 module store 替代多个 `useState + refresh` hook 副本。
   - `useStore.ts` 收敛为统一数据访问层。

2. **继续拆 `PostGame.tsx`**
   - 抽出：
     - `useOpenDotaImport()`：OpenDota import / polling 状态机。
     - `mergeMatchupNotesToHeroProfile()`：对位笔记合并纯逻辑。
     - `usePostGameSave()`：保存对局、关联 preGame、触发 SRS。
   - 页面只负责布局和用户输入。

3. **Streak / Freeze 编排下沉**
   - 抽 `features/streak/`，Home 只消费结果。
   - 确保 Home / TrainingPlan 对 streak 计算口径一致。

### 验收标准

- `PostGame.tsx` 目标降到 300 行以内。
- 新增 OpenDota import 状态机测试。
- Home / TrainingPlan streak 数值用同一入口计算。

---

## Phase E — 英雄稳定 ID 迁移

### 目标

解决中文显示名作为主键带来的长期数据孤儿风险。

### 前置条件

必须先完成 Phase A 的 migration 框架。

### 范围

1. **引入稳定 hero id**
   - 内部主键统一使用 OpenDota hero id。
   - 中文名 / 英文名 / 别名只用于 UI 和搜索。

2. **迁移历史数据**
   - 通过当前 alias resolver 把历史字段转换：
     - `heroPool[].name -> heroId`
     - `heroNotes[].hero -> heroId`
     - `matchLogs[].hero -> heroId`
     - `matchupNotes` key -> heroId
     - matchup cache key -> heroId
   - 对无法解析的历史值保留 `legacyName` 并在 UI 提醒。

3. **显示层适配**
   - 所有页面展示时从 `heroId` resolve displayName。
   - 搜索仍支持中文 / 英文 / 别名。

### 验收标准

- 改一个英雄中文显示名后，老用户的：
  - 英雄池；
  - 英雄笔记；
  - SRS；
  - 历史对局；
  - matchup notes；
  均不丢失。

---

## 暂不处理 / 低优先级

- 为 `index.html` 增加 CSP。
- `syncOpenDotaHeroMatchups` 改名为 `syncHeroMatchups`。
- 清理长期未关联的 `preGameSetups` 草稿。
- 将 `electron/` 与 `src/` 共享代码移动到 `shared/`。

这些可以穿插在 Phase B-D 中做，但不应抢在 Phase A 之前。
