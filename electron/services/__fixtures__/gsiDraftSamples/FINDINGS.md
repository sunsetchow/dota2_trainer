# Phase 30.0 — GSI PoC 可行性门禁：本次未执行

对应 Implementation Plan v1.12 §30.0（强制 gate）。

## 状态：**未验证（Not Performed）**，既不是 Go 也不是 No-Go

本次实现是在**没有真实 Dota 2 客户端**的开发环境中完成的，因此无法：

- 手动在 `game/dota/cfg/gamestate_integration/` 下放置临时 cfg 并抓包。
- 用一次性 `http.createServer` 脚本捕获 Captain's Mode / All Pick / Ranked All
  Pick 三种真实对局的选人阶段 payload。
- 确认 `draft` 顶层字段是否存在、`team2` 的真实嵌套结构、英雄标识是
  `hero_id` 数字还是 `npc_dota_hero_*` 内部英文名、以及 All Pick /
  Ranked All Pick 是否也推送 `draft` 数据。

## 本次做了什么代替

- `src/schema/gsi.ts` / `src/utils/gsiDraft.ts` 里的 payload 结构是基于
  公开 GSI 文档的**待验证草案**，明确在代码注释里标注"未经真实客户端验证"。
- `captains-mode.jsonl` / `all-pick.jsonl` / `ranked-all-pick.jsonl` 是
  **手写脱敏合成样本**，不是从真实客户端抓取的数据，仅用于覆盖 parser 的
  结构性单测（去重、心跳降级、`GAME_IN_PROGRESS` 后不再更新敌方英雄等逻辑），
  **不能**作为"字段名已确认正确"的证据。
- 按 Plan 30.10 Stage A 的 No-Go/待验证降级路径处理：只交付
  配置检测/安装/卸载（30.1）、本地 server（30.2）、payload schema/parser
  骨架（30.3，未验证）、IPC/preload 骨架（30.5）、设置页开关和状态展示
  （30.7，文案明确写"暂不支持自动识别，等待真实客户端验证"）。
- **没有**做 Draft 助手自动填充（30.6）——这是 Stage B 的范围，Stage B
  需要 30.0 判定为 Go 才能开始，而这次连 Go/No-Go 判定本身都没能做。

## Go/No-Go 判定

**未判定**。既不能宣称"可行"，也不能宣称"不可行"；只能确认"骨架代码已就绪，
等待在真实 Dota 2 客户端上跑一遍 30.0 的手动抓包步骤"。

## 后续需要做什么

下一次有真实 Dota 2 客户端的开发环境时，按 Plan 30.0 的 5 个步骤执行：

1. 手动放置临时 cfg（`gamestate_integration_dota2trainer_dev.cfg`），指向
   `http://127.0.0.1:53411/gsi`。
2. 用一次性脚本抓 Captain's Mode / All Pick / Ranked All Pick 各一局的选人阶段
   payload，脱敏后替换本目录下对应的 `*.jsonl`（保留文件名和一行一个 payload
   的格式，方便复用现有 `gsiDraft.test.ts`）。
3. 对照真实 payload 调整 `src/schema/gsi.ts` 的字段名/嵌套层级（尤其是
   `draft.team2` 的实际结构和英雄标识格式）。
4. 把 Go/No-Go 判定写回 Implementation Plan 下一次修订版，而不是继续把
   本次的"未验证"状态当成既定结论传下去。
5. 只有判定为 Go，才能开始 Stage B（Draft 助手自动填充，Plan 30.6）。

在此之前：**Draft 助手保持纯手动输入，本 Phase 不新增任何自动填充路径**。
