import type { HeroNote } from '../../types'
import type { SrsRating } from '../../utils/srs.ts'

interface HeroNoteReviewCardProps {
  note: HeroNote
  onRate: (rating: SrsRating) => Promise<void> | void
  onOpenNote?: (hero: string) => void
  compact?: boolean
}

const RATING_OPTIONS: Array<[SrsRating, string, string]> = [
  ['forgot', '忘了', '明天再看'],
  ['hard', '勉强', '短间隔'],
  ['good', '记得', '正常间隔'],
  ['easy', '很熟', '拉长间隔'],
]

function notePreview(note: HeroNote): string[] {
  return [
    note.laneGoal && `对线目标：${note.laneGoal}`,
    note.firstKeyItem && `关键装：${note.firstKeyItem}`,
    note.commonDeaths && `常见死亡：${note.commonDeaths}`,
    note.whenToFight && `何时打架：${note.whenToFight}`,
    ...(note.reviewRules ?? []).map(rule => `规则：${rule}`),
  ].filter((value): value is string => Boolean(value && value.trim()))
}

export default function HeroNoteReviewCard({ note, onRate, onOpenNote, compact = false }: HeroNoteReviewCardProps) {
  const preview = notePreview(note).slice(0, compact ? 2 : 4)

  return (
    <div className="space-y-3 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">复习：{note.hero}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {note.srsNextReviewDate ? `原定复习日：${note.srsNextReviewDate}` : '首次复习：这条笔记还没有排程，按方案 A 视为待复习。'}
            {note.srsIntervalDays ? ` · 当前间隔 ${note.srsIntervalDays} 天` : ''}
          </div>
        </div>
        {onOpenNote && (
          <button type="button" onClick={() => onOpenNote(note.hero)} className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent-border)]">
            打开档案
          </button>
        )}
      </div>

      {preview.length > 0 && (
        <div className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
          {preview.map(item => <div key={item}>{item}</div>)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RATING_OPTIONS.map(([rating, label, helper]) => (
          <button
            key={rating}
            type="button"
            onClick={() => onRate(rating)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 text-left text-xs text-[var(--text-secondary)] hover:border-[var(--accent-border)]"
          >
            <div className="font-semibold text-[var(--text-primary)]">{label}</div>
            <div className="mt-0.5 text-[var(--text-muted)]">{helper}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
