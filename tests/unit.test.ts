import { describe, expect, test } from 'vitest'
import { describeHistory } from '../src/lib/card'
import { formatDateTime, formatDueDate, isOverdue, todayString } from '../src/lib/dates'
import { EMPTY_FILTER, endOfWeek, isFilterActive, matchesCardFilter, UNASSIGNED } from '../src/lib/filter'
import { compareByOrder, orderAt } from '../src/lib/order'
import type { Card } from '../src/types'

// Emulator を使わない単体テスト

describe('orderAt', () => {
  const items = [
    { id: 'a', order: 'a0' },
    { id: 'b', order: 'a1' },
    { id: 'c', order: 'a2' },
  ]

  test('先頭・間・末尾に入れる order を作る', () => {
    expect(orderAt(items, 0) < 'a0').toBe(true)
    const middle = orderAt(items, 1)
    expect(middle > 'a0' && middle < 'a1').toBe(true)
    expect(orderAt(items, 3) > 'a2').toBe(true)
  })

  test('空のリストにも入れられる', () => {
    expect(typeof orderAt([], 0)).toBe('string')
  })

  test('同時に追加されて order が重なっていても、例外を出さずに並びを保つ', () => {
    const duplicated = [
      { id: 'a', order: 'a0' },
      { id: 'b', order: 'a1' },
      { id: 'c', order: 'a1' },
      { id: 'd', order: 'a2' },
    ]
    // b と c の間に入れる
    const order = orderAt(duplicated, 2)
    expect(order > 'a1' && order < 'a2').toBe(true)
    // 重なった値が末尾にある場合
    expect(orderAt(duplicated.slice(0, 3), 2) > 'a1').toBe(true)
  })

  test('結果の order で並べ替えると、指定した位置に入る', () => {
    const order = orderAt(items, 2)
    const sorted = [...items, { id: 'new', order }].sort(compareByOrder)
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'new', 'c'])
  })
})

describe('compareByOrder', () => {
  test('order が同じなら id で並べ、全員の画面で同じ順になる', () => {
    const sorted = [{ id: 'y', order: 'a1' }, { id: 'x', order: 'a1' }, { id: 'z', order: 'a0' }].sort(compareByOrder)
    expect(sorted.map((item) => item.id)).toEqual(['z', 'x', 'y'])
  })
})

describe('期限', () => {
  test('todayString は端末のタイムゾーンの日付を返す', () => {
    expect(todayString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  test('期限の当日はまだ期限切れではない', () => {
    expect(isOverdue('2026-10-13', '2026-10-13')).toBe(false)
    expect(isOverdue('2026-10-12', '2026-10-13')).toBe(true)
    expect(isOverdue(null, '2026-10-13')).toBe(false)
  })

  test('今年の期限は月/日、それ以外は年も表示する', () => {
    expect(formatDueDate('2026-10-31', '2026-10-13')).toBe('10/31')
    expect(formatDueDate('2027-01-05', '2026-10-13')).toBe('2027/1/5')
  })
})

describe('formatDateTime', () => {
  test('今年なら月/日 時:分、それ以外は年も表示する', () => {
    const now = new Date(2026, 9, 13)
    expect(formatDateTime(new Date(2026, 9, 13, 9, 5), now)).toBe('10/13 9:05')
    expect(formatDateTime(new Date(2025, 0, 2, 14, 30), now)).toBe('2025/1/2 14:30')
  })
})

describe('describeHistory', () => {
  test('操作の種類ごとに文章にする', () => {
    expect(describeHistory({ type: 'moved', from: { columnName: '未着手' }, to: { columnName: '進行中' } }))
      .toBe('「未着手」から「進行中」に移動しました')
    expect(describeHistory({ type: 'due_changed', from: { dueDate: null }, to: { dueDate: '2026-10-31' } }))
      .toBe('期限をなしから「2026-10-31」に変更しました')
    expect(describeHistory({ type: 'assignees_changed', from: { names: [] }, to: { names: ['Alice', 'Bob'] } }))
      .toBe('担当者をなしから「Alice、Bob」に変更しました')
    expect(describeHistory({ type: 'created', from: null, to: null })).toBe('カードを作成しました')
  })
})

describe('絞り込み', () => {
  const TODAY = '2026-10-13' // 火曜日

  function card(fields: Partial<Card>): Card {
    return {
      id: 'c', columnId: 'col', order: 'a0', title: '', description: '', dueDate: null,
      assigneeIds: [], labelIds: [], checklist: [], commentCount: 0, archived: false, archivedAt: null,
      ...fields,
    }
  }

  test('条件がなければすべて表示し、絞り込み中とはみなさない', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
    expect(isFilterActive({ ...EMPTY_FILTER, keyword: '  ' })).toBe(false)
    expect(matchesCardFilter(card({ title: 'なんでも' }), EMPTY_FILTER, TODAY)).toBe(true)
  })

  test('キーワードはタイトルと説明から探し、全角・半角や大文字・小文字の違いを無視する', () => {
    const target = card({ title: 'ＡＰＩの設計', description: '認証まわりを決める' })
    expect(matchesCardFilter(target, { ...EMPTY_FILTER, keyword: 'api' }, TODAY)).toBe(true)
    expect(matchesCardFilter(target, { ...EMPTY_FILTER, keyword: '認証' }, TODAY)).toBe(true)
    expect(matchesCardFilter(target, { ...EMPTY_FILTER, keyword: 'デザイン' }, TODAY)).toBe(false)
  })

  test('担当者は選んだ人のいずれかが担当していれば表示する。「担当者なし」も選べる', () => {
    const filter = { ...EMPTY_FILTER, assigneeIds: ['alice', UNASSIGNED] }
    expect(matchesCardFilter(card({ assigneeIds: ['alice', 'bob'] }), filter, TODAY)).toBe(true)
    expect(matchesCardFilter(card({ assigneeIds: [] }), filter, TODAY)).toBe(true)
    expect(matchesCardFilter(card({ assigneeIds: ['bob'] }), filter, TODAY)).toBe(false)
  })

  test('期限の条件', () => {
    const due = (dueDate: string | null, condition: 'overdue' | 'today' | 'this_week' | 'none') =>
      matchesCardFilter(card({ dueDate }), { ...EMPTY_FILTER, due: [condition] }, TODAY)
    expect(due('2026-10-12', 'overdue')).toBe(true)
    expect(due('2026-10-13', 'overdue')).toBe(false)
    expect(due('2026-10-13', 'today')).toBe(true)
    expect(due('2026-10-12', 'today')).toBe(true)
    expect(due('2026-10-18', 'this_week')).toBe(true)
    expect(due('2026-10-19', 'this_week')).toBe(false)
    expect(due(null, 'none')).toBe(true)
    expect(due(null, 'today')).toBe(false)
  })

  test('種類の違う条件は、すべて満たすカードだけを表示する', () => {
    const filter = { ...EMPTY_FILTER, labelIds: ['urgent'], assigneeIds: ['alice'] }
    expect(matchesCardFilter(card({ labelIds: ['urgent'], assigneeIds: ['alice'] }), filter, TODAY)).toBe(true)
    expect(matchesCardFilter(card({ labelIds: ['urgent'], assigneeIds: ['bob'] }), filter, TODAY)).toBe(false)
  })

  test('今週の終わりは日曜日。日曜日当日はその日、月をまたぐ場合も正しく計算する', () => {
    expect(endOfWeek('2026-10-13')).toBe('2026-10-18')
    expect(endOfWeek('2026-10-18')).toBe('2026-10-18')
    expect(endOfWeek('2026-10-19')).toBe('2026-10-25')
    expect(endOfWeek('2026-12-29')).toBe('2027-01-03')
  })
})
