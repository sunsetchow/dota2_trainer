import type { HeroNote } from '../../types'
import { applySrsRating, type SrsRating } from '../../utils/srs.ts'
import { todayStr } from '../../utils/cycle.ts'

interface SrsReviewPromptProps {
  notes: HeroNote[]
  onSkip: () => void
  onOpenNote: (hero: string) => void
  onReviewed: (hero: string) => void
  upsertHeroNote: (note: HeroNote) => Promise<void>
}

export default function SrsReviewPrompt({ notes, onSkip, onOpenNote, onReviewed, upsertHeroNote }: SrsReviewPromptProps) {
  if (notes.length === 0) return null

  return (
    <div className="space-y-3 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] p-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">英雄笔记复习</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">只对你主动维护过的英雄笔记做 SM-2 调度。</p>
      </div>
      {notes.map(note => (
        <div key={note.hero} className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{note.hero}</div>
            <button type="button" onClick={() => onOpenNote(note.hero)} className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent-border)]">
              打开档案
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {([
              ['forgot', '忘了'],
              ['hard', '勉强'],
              ['good', '记得'],
              ['easy', '很熟'],
            ] as Array<[SrsRating, string]>).map(([rating, label]) => (
              <button
                key={rating}
                type="button"
                onClick={async () => {
                  const result = applySrsRating({ ease: note.srsEase, intervalDays: note.srsIntervalDays }, rating, todayStr())
                  await upsertHeroNote({
                    ...note,
                    srsEase: result.ease,
                    srsIntervalDays: result.intervalDays,
                    srsNextReviewDate: result.nextReviewDate,
                    srsLastRating: rating,
                  })
                  onReviewed(note.hero)
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent-border)]"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" onClick={onSkip} className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--accent-border)]">
        跳过并返回首页
      </button>
    </div>
  )
}
