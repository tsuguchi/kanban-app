import { generateKeyBetween } from 'fractional-indexing'

// 並び順（小数点インデックス）の計算。DATA_MODEL.md §1 を参照

interface Ordered {
  id: string
  order: string
}

// order で並べる。同時に追加されて order が重なった場合も、全員の画面で同じ順になるよう id で決める
export function compareByOrder(a: Ordered, b: Ordered): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// 並び替え済みのリスト `items` の `index` の位置に入れるための order を返す。
// `items` には、動かす要素自身を含めないこと
export function orderAt(items: readonly Ordered[], index: number): string {
  const before = index > 0 ? items[index - 1].order : null
  // 同時編集で order が重なっていると、前後の値が同じになり間に入れられない。
  // その場合は、前の値より大きい最初の値との間に入れる
  const after = items.slice(index).find((item) => before === null || item.order > before)?.order ?? null
  return generateKeyBetween(before, after)
}
