import { useEffect, useState } from 'react'
import { describeHistory, subscribeHistory } from '../../../lib/card'
import { formatDateTime } from '../../../lib/dates'
import { db } from '../../../lib/firebase'
import type { BoardMember, HistoryEntry } from '../../../types'

interface CardHistoryProps {
  boardId: string
  cardId: string
  members: BoardMember[]
}

// 変更履歴（F-90、F-91）。新しいものから表示する
export function CardHistory({ boardId, cardId, members }: CardHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => subscribeHistory(db, boardId, cardId, setEntries, (error) => {
    console.error(error)
    setLoadError(true)
  }), [boardId, cardId])

  return (
    <section className="card-detail-section">
      <h3>変更履歴</h3>
      {loadError && <p className="error-message" role="alert">変更履歴を読み込めませんでした。</p>}
      {entries === null && !loadError && <p className="hint">読み込み中…</p>}
      <ul className="history-list">
        {entries?.map((entry) => {
          const actor = members.find((member) => member.uid === entry.actorId)?.displayName ?? '退出したメンバー'
          return (
            <li key={entry.id}>
              <strong>{actor}</strong> さんが{describeHistory(entry)}
              <span className="history-time">{formatDateTime(entry.createdAt)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
