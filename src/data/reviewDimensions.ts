import type { TrainingDimension } from '../types'

export interface ReviewDimensionOption {
  id: TrainingDimension;
  label: string;
  description: string;
  topics: string[];
}

export const REVIEW_DIMENSIONS: ReviewDimensionOption[] = [
  {
    id: 'ops',
    label: '操作基础',
    description: '能不能稳定执行',
    topics: ['补刀 / Deny', '技能连招', '走位 / Attack-move', '快捷键与操作习惯'],
  },
  {
    id: 'pregame',
    label: '局外判断',
    description: '上场前是否想清楚',
    topics: ['英雄克制关系', '阵容构成判断', '本英雄强弱势期', '己方胜利条件与优先任务'],
  },
  {
    id: 'economy',
    label: '局内经济线',
    description: '钱从哪里来',
    topics: ['补刀与对线管理', '刷钱路线规划', '中立资源时机', '安全区 / 争夺区 / 危险区'],
  },
  {
    id: 'combat',
    label: '局内战斗',
    description: '什么时候打、怎么打',
    topics: ['参团 vs 继续发育', '装备选择', '先手 / 切入时机与站位', '地图意识与视野支撑'],
  },
  {
    id: 'objective',
    label: '局内目标',
    description: '打完之后做什么',
    topics: ['推进时机选择', '大地图目标优先级', '建筑 / 肉山 / 装备交换', '兵线处理后再行动'],
  },
]

export function getReviewDimensionLabel(id?: TrainingDimension): string | undefined {
  return REVIEW_DIMENSIONS.find(item => item.id === id)?.label
}
