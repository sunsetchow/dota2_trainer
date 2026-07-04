# Overwolf GSI Spike Findings

## Current status

Not run yet. This repository branch only adds the minimal Overwolf app needed to capture Dota 2 GEP data on a Windows machine.

## Question to answer

Can Overwolf GEP expose enemy hero picks during **Ranked All Pick hero selection** before the game starts?

## Evidence to collect

For each tested mode, paste a short sanitized summary here after running the spike:

| Mode | `match_state` reached hero selection? | `draft` present? | Enemy hero IDs before game start? | Notes |
| --- | --- | --- | --- | --- |
| Captain's Mode | TBD | TBD | TBD | TBD |
| All Pick | TBD | TBD | TBD | TBD |
| Ranked All Pick | TBD | TBD | TBD | TBD |

## Decision

- **Go**: Ranked All Pick exposes enemy public picks as `heroId` before game start.
- **Partial Go**: Captain's Mode works but Ranked All Pick does not.
- **No-Go**: `draft` is empty or only updates after game start.

Until this file is filled with real Windows + Dota 2 results, Dota2 Trainer should keep Draft input manual and should not implement Overwolf auto-fill.
