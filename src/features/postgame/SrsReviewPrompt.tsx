import type { HeroNote } from '../../types'
import { applySrsRating, type SrsRating } from '../../utils/srs.ts'
import { todayStr } from '../../utils/cycle.ts'
import HeroNoteReviewCard from '../heroNotes/HeroNoteReviewCard.tsx'

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
        <HeroNoteReviewCard
          key={note.hero}
          note={note}
          compact
          onOpenNote={onOpenNote}
          onRate={async (rating: SrsRating) => {
            const result = applySrsRating({ ease: note.srsEase, intervalDays: note.srsIntervalDays }, rating, todayStr())
            await upsertHeroNote({
              ...note,
              srsEase: result.ease,
              srsIntervalDays: result.intervalDays,
              srsNextReviewDate: result.nextReviewDate,
              srsLastRating: rating,
              updatedAt: Date.now(),
            })
            onReviewed(note.hero)
          }}
        />
      ))}
      <button type="button" onClick={onSkip} className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--accent-border)]">
        跳过并返回首页
      </button>
    </div>
  )
}
