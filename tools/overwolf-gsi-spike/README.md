# Dota2 Trainer — Overwolf GSI Spike

This is a **Windows-only feasibility spike** for Dota 2 draft data through Overwolf GEP. It is intentionally separate from the main Dota2 Trainer Electron app.

## Goal

Answer one question with real Dota 2 data:

> Does Overwolf `draft` expose enemy `heroId`s during Ranked All Pick / All Pick / Captain's Mode hero selection?

If yes, a future companion bridge can forward sanitized draft snapshots to Dota2 Trainer. If no, we should not build automatic Draft fill on top of Overwolf.

## What this spike does

- Loads as a minimal unpacked Overwolf Native WebApp.
- Subscribes to Dota 2 GEP features:
  - `game`, `game_state`, `game_state_changed`, `match_state_changed`, `match_detected`
  - `draft`, `bans`, `roster`, `hero_pool`, `me`, `match_info`
- Displays and copies sanitized JSONL logs.
- Redacts keys containing `steam`, `account`, or `name` before showing/copying logs.
- Optionally forwards sanitized entries to a localhost bridge URL for later integration experiments.

It does **not**:

- Read memory.
- Hook Dota 2.
- Modify Dota2 Trainer data.
- Auto-fill Draft.
- Persist raw payloads in the repo.

## Prerequisites

- Windows machine with Dota 2 + Overwolf installed.
- Overwolf developer / unpacked app loading enabled.
- Steam → Dota 2 → Properties → Launch Options includes:

```text
-gamestateintegration
```

Overwolf's Dota 2 docs explicitly require this launch option for Dota 2 apps.

## Loading the spike

1. Copy or checkout this repository on the Windows Dota machine.
2. Open Overwolf developer tools / load unpacked extension.
3. Select this folder:

```text
tools/overwolf-gsi-spike
```

4. Launch Dota 2.
5. In the spike window click:
   - `检查当前 Dota 2 进程`
   - `订阅 Dota 2 features`
   - `读取当前 info`

> Note: `manifest.json` uses Overwolf game id `7314` for Dota 2, based on Overwolf sample manifests. Verify the actual runtime id in the `game_info` log; adjust if Overwolf reports a different id.

## Test matrix

Run at least one test for each mode:

| Mode | Required capture window | Pass condition |
| --- | --- | --- |
| Captain's Mode | Hero selection / draft | `draft` updates contain both teams' `heroId` values before game starts |
| All Pick | Hero selection | Enemy public picks appear as `heroId` before game starts |
| Ranked All Pick | Hero selection | Enemy public picks appear as `heroId` before game starts |

For each mode:

1. Start queue / lobby.
2. Wait until hero selection.
3. Watch `matchState` for `DOTA_GAMERULES_STATE_HERO_SELECTION`.
4. Click `复制 JSONL` after picks/bans change.
5. Paste into a local temporary file outside the repo.
6. Manually inspect whether `draft` has data like:

```json
[{"heroId":56,"team":3},{"heroId":69,"team":2}]
```

## Go / No-Go

### Go for Overwolf companion

Proceed only if **Ranked All Pick** hero selection reliably exposes enemy public picks before the game starts.

### Partial Go

If only Captain's Mode works, keep this as a tournament/lobby-only experiment; do not build Ranked Draft auto-fill.

### No-Go

If `draft` is empty or updates only after the game starts, do not build auto-fill. Keep manual Draft input as the product path.

## Handling captured data

Do not commit raw logs. If logs are useful for tests:

1. Remove player names, Steam IDs, account IDs, match IDs where needed.
2. Reduce to a minimal fixture showing only `match_state`, `me.team`, `draft`, and `bans`.
3. Mark whether the fixture is real-sanitized or synthetic.
4. Update `electron/services/__fixtures__/gsiDraftSamples/FINDINGS.md` in the main app if this changes the GSI plan.

## References

- Overwolf Dota 2 GEP docs: <https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/dota-2>
- Overwolf GEP intro: <https://dev.overwolf.com/ow-native/live-game-data-gep/live-game-data-gep-intro>
- Overwolf manifest docs: <https://dev.overwolf.com/ow-native/reference/manifest/manifest-json>
