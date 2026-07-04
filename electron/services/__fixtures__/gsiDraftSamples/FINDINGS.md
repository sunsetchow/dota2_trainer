# Phase 30.0 — GSI PoC 可行性门禁：已执行，结论 No-Go（敌方英雄自动识别）

对应 Implementation Plan v1.12 §30.0（强制 gate）。

## 状态：**已验证，No-Go**（针对"GSI 识别敌方 pick/ban 并自动填充 Draft"这个目标）

2026-07-04 在真实 Dota 2 客户端（人机对局，appid 570, version 48）上完成抓包验证：

- 用项目实际的 `gsiConfig.installGsiConfig` / `gsiServer.startGsiServer` /
  `gsiService.enableGsi` 代码（未走 UI，因为当时的 Settings.tsx 还没接上 GSI
  区域的 JSX，属于另一个已修的 bug）直接对接真实客户端，cfg 写入
  `.../game/dota/cfg/gamestate_integration/gamestate_integration_dota2trainer.cfg`，
  确认 server 正常收到 POST、token 校验通过。
- **`draft` 顶层字段全程都是空对象 `{}`**——覆盖了 `DOTA_GAMERULES_STATE_STRATEGY_TIME`
  （选人阶段）、`DOTA_GAMERULES_STATE_TEAM_SHOWCASE`、`DOTA_GAMERULES_STATE_PRE_GAME`
  三个阶段，从未出现任何英雄 ID 或 pick/ban 内容。结合 Valve 官方 GSI 文档只列出
  `provider`/`map`/`player`/`hero`/`abilities`/`items`/`buildings`/`wearables`
  这些类别、并不存在 `draft` 类别，可以判定 cfg 里 `"draft": "1"` 这个 flag
  客户端根本不识别，直接忽略；顶层 `draft` 键只是恒为空的占位符，不是被截断或
  格式不对。
- 追加订阅 `player`/`hero`（临时验证用，未保留进正式代码）后确认这两个类别是
  真实有效的官方数据源，且**同时**提供 `hero.id`（数字，如 `82`）和
  `hero.name`（`npc_dota_hero_meepo` 形式的内部英文名）——不是二选一。
- 但 `player`/`hero` 只暴露**本机玩家自己的视角**：只能看到自己选的英雄，
  全程没有任何字段能看到敌方 5 个英雄的 pick 或 ban。这是 Valve GSI 协议本身
  的边界（本地 GSI 不推送对方不可见的信息），不是这次实现遗漏了字段。

## Go/No-Go 判定

**No-Go（针对 Stage B / Plan 30.6 "Draft 助手自动填充敌方英雄"这个具体目标）**。
GSI 在当前项目使用的本地-玩家视角下，没有任何已知数据类别能提供敌方 pick/ban
信息：`draft` 类别不存在，`player`/`hero` 只反映己方视角。除非改用需要观战权限
/ 联赛级 GSI（第三方观战工具那种）的完全不同集成方式，否则"自动识别对面英雄"
这个方向在当前架构下无法实现。

自己一方的英雄识别（`hero.id`/`hero.name`）本身是可行的，如果未来有"自动填我
方英雄"这种更小范围的需求，可以复用这次验证的 `player`+`hero` 订阅结论，但这
不是 Plan 30.6 想做的敌方识别功能。

## Stage A 骨架现状（未受本次结论影响，仍然保留）

- `src/schema/gsi.ts` / `src/utils/gsiDraft.ts` 里的 payload 结构是基于
  公开 GSI 文档的**待验证草案**，实测证明其中的 `draft` 分支不会被真实数据
  触发（见上）。字段结构本身不需要再花时间对照真机调整——因为数据源不存在，
  调对了字段名也没有用。
- `captains-mode.jsonl` / `all-pick.jsonl` / `ranked-all-pick.jsonl` 是
  **手写脱敏合成样本**，不是从真实客户端抓取的数据，仅用于覆盖 parser 的
  结构性单测（去重、心跳降级、`GAME_IN_PROGRESS` 后不再更新敌方英雄等逻辑）。
  这些单测继续有效（验证 parser 代码逻辑本身没 bug），但不再是"等待真机验证
  字段"的占位，因为已经确认真机不会产生非空 `draft`。
- 配置检测/安装/卸载（30.1）、本地 server（30.2）、IPC/preload 骨架（30.5）
  经真机验证工作正常。
- 设置页 GSI 开关（30.7）在这次测试中发现从未接入 JSX 渲染——`Settings.tsx`
  里定义了完整的 state 和 handler（`gsiStatus`/`handleEnableGsi`/
  `handleDisableGsi`/`handleChooseGsiCfgDir`），但从未在 JSX 里渲染出来，
  用户在界面上完全看不到这个开关。这是独立于 30.0 判定之外的一个真实 bug，
  **本次未修复**（因为整个 GSI 敌方识别方向已经 No-Go，是否还值得补这个 UI
  取决于后续 30.7 的范围怎么调整），需要在下一次修订里单独决定。

## 后续需要做什么

1. **不要**开始 Plan 30.6（Draft 助手自动填充敌方英雄）——数据源已确认不存在，
   继续投入这个方向没有意义。
2. 把这次 No-Go 判定同步进 Implementation Plan 下一次修订版，关闭或重新定义
   30.6 这个条目。
3. 如果仍然想做"实时识别对手英雄"这个产品目标，需要评估 GSI 之外的技术路线
   （比如读取战网/第三方观战数据源、OCR 识别游戏画面等），每种都有各自的
   可行性和合规风险，需要单独立项评估，不属于本次 Phase 30 GSI 骨架的范围。
4. Draft 助手继续保持纯手动输入，本 Phase 不新增任何自动填充路径。
