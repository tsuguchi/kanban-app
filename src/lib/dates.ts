// 期限（"YYYY-MM-DD"）の扱い。期限は日付だけを持ち、利用者の端末のタイムゾーンで判定する

export function todayString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// 期限を過ぎているか（F-44）。期限の当日はまだ過ぎていない
export function isOverdue(dueDate: string | null, today: string = todayString()): boolean {
  return dueDate !== null && dueDate < today
}

// "2026-10-31" → "10/31"。今年でなければ年も付ける
export function formatDueDate(dueDate: string, today: string = todayString()): string {
  const [year, month, day] = dueDate.split('-')
  const short = `${Number(month)}/${Number(day)}`
  return year === today.slice(0, 4) ? short : `${year}/${short}`
}
