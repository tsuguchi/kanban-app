import type { Card } from '../types'
import { todayString } from './dates'

// ボード上のカードの絞り込み（F-80〜F-83）。条件は自分の画面だけに効き、保存しない

export const UNASSIGNED = '__unassigned__'

export type DueFilter = 'overdue' | 'today' | 'this_week' | 'none'

export interface CardFilter {
  keyword: string
  // UNASSIGNED は「担当者なし」
  assigneeIds: string[]
  labelIds: string[]
  due: DueFilter[]
}

export const EMPTY_FILTER: CardFilter = { keyword: '', assigneeIds: [], labelIds: [], due: [] }

export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  overdue: '期限切れ',
  today: '今日まで',
  this_week: '今週まで',
  none: '期限なし',
}

export function isFilterActive(filter: CardFilter): boolean {
  return filter.keyword.trim() !== ''
    || filter.assigneeIds.length > 0
    || filter.labelIds.length > 0
    || filter.due.length > 0
}

// 今週の日曜日（週は月曜始まり）。"YYYY-MM-DD"
export function endOfWeek(today: string): string {
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const daysUntilSunday = (7 - date.getDay()) % 7
  date.setDate(date.getDate() + daysUntilSunday)
  return todayString(date)
}

// 全角・半角や大文字・小文字の違いを無視して比べるための正規化
function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

function matchesDue(dueDate: string | null, due: DueFilter, today: string): boolean {
  switch (due) {
    case 'overdue':
      return dueDate !== null && dueDate < today
    // 「今日まで」「今週まで」は、期限切れのものも含む
    case 'today':
      return dueDate !== null && dueDate <= today
    case 'this_week':
      return dueDate !== null && dueDate <= endOfWeek(today)
    case 'none':
      return dueDate === null
  }
}

// 同じ種類の条件どうしは「いずれか」、種類の違う条件どうしは「すべて」を満たすカードを残す
export function matchesCardFilter(card: Card, filter: CardFilter, today: string = todayString()): boolean {
  const keyword = normalize(filter.keyword.trim())
  if (keyword && !normalize(`${card.title}\n${card.description}`).includes(keyword)) return false

  if (filter.assigneeIds.length > 0) {
    const matched = filter.assigneeIds.some((id) =>
      id === UNASSIGNED ? card.assigneeIds.length === 0 : card.assigneeIds.includes(id))
    if (!matched) return false
  }

  if (filter.labelIds.length > 0 && !filter.labelIds.some((id) => card.labelIds.includes(id))) return false

  if (filter.due.length > 0 && !filter.due.some((due) => matchesDue(card.dueDate, due, today))) return false

  return true
}
