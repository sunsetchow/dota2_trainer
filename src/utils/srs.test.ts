import { describe, expect, it } from 'vitest'

import { applySrsRating, isDueForReview } from './srs'

describe('hero note SRS review scheduling', () => {
  it('treats unscheduled notes as due for first review', () => {
    expect(isDueForReview({}, '2026-07-02')).toBe(true)
  })

  it('treats notes scheduled for today or earlier as due', () => {
    expect(isDueForReview({ srsNextReviewDate: '2026-07-01' }, '2026-07-02')).toBe(true)
    expect(isDueForReview({ srsNextReviewDate: '2026-07-02' }, '2026-07-02')).toBe(true)
    expect(isDueForReview({ srsNextReviewDate: '2026-07-03' }, '2026-07-02')).toBe(false)
  })

  it('schedules the next review after rating a first-time note', () => {
    expect(applySrsRating({}, 'good', '2026-07-02')).toEqual({
      ease: 2.5,
      intervalDays: 3,
      nextReviewDate: '2026-07-05',
    })
  })
})
