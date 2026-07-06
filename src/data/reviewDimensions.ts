import type { TrainingDimension } from '../types'
import zh from '../i18n/zh.ts'
import en from '../i18n/en.ts'

const REVIEW_DIMENSION_DICTS = { zh: zh.reviewDimensions, en: en.reviewDimensions }
const DIMENSION_IDS: TrainingDimension[] = ['ops', 'pregame', 'economy', 'combat', 'objective']

export interface ReviewDimensionOption {
  id: TrainingDimension;
  label: string;
  description: string;
  topics: string[];
}

// 中文版本作为默认/legacy 调用点的 fallback；需要英文版就用 getReviewDimensions('en')。
export const REVIEW_DIMENSIONS: ReviewDimensionOption[] = getReviewDimensions('zh')

export function getReviewDimensions(language: 'zh' | 'en' = 'zh'): ReviewDimensionOption[] {
  const dict = REVIEW_DIMENSION_DICTS[language]
  return DIMENSION_IDS.map(id => ({ id, ...dict[id] }))
}

export function getReviewDimensionLabel(id?: TrainingDimension, language: 'zh' | 'en' = 'zh'): string | undefined {
  if (!id) return undefined
  return REVIEW_DIMENSION_DICTS[language][id].label
}
