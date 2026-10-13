import { describe, expect, test } from 'vitest'
import { formatDueDate, isOverdue, todayString } from '../src/lib/dates'
import { compareByOrder, orderAt } from '../src/lib/order'

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
