import { z } from 'zod'

// ⚠️ 30.0 可行性 PoC 门禁未执行：本环境没有真实 Dota 2 客户端可供抓包，
// 无法确认下面的字段名/嵌套层级是否和真实 GSI 推送一致。这里的 schema
// 只是基于公开 GSI 文档的最佳猜测草案，测试用的 fixture 也是手写脱敏样本
// （见 electron/services/__fixtures__/gsiDraftSamples/FINDINGS.md）。
// 在真实客户端验证通过前，绝不能把这层解析结果当成"已验证可用"，
// 也不能据此在 Draft 页做自动填充。
export const GsiDraftTeamPicksSchema = z.object({
  picks: z.array(z.number().int().nonnegative()).optional(),
  bans: z.array(z.number().int().nonnegative()).optional(),
}).passthrough()

export const GsiDraftPayloadSchema = z.object({
  provider: z.object({
    name: z.string().optional(),
    appid: z.number().optional(),
  }).passthrough().optional(),
  map: z.object({
    game_state: z.string().optional(),
  }).passthrough().optional(),
  draft: z.object({
    activeteam: z.number().optional(),
    pick: z.boolean().optional(),
    team2: GsiDraftTeamPicksSchema.optional(),
  }).passthrough().optional(),
}).passthrough()

export type GsiDraftTeamPicks = z.infer<typeof GsiDraftTeamPicksSchema>
export type GsiDraftPayload = z.infer<typeof GsiDraftPayloadSchema>

/**
 * Best-effort validation only: GSI也会给同一个 endpoint 推送心跳包/非选人阶段的包，
 * 这些不算错误，解析失败一律返回 null，调用方不应抛异常中断连接。
 */
export function parseGsiDraftPayload(raw: unknown): GsiDraftPayload | null {
  const result = GsiDraftPayloadSchema.safeParse(raw)
  return result.success ? result.data : null
}
