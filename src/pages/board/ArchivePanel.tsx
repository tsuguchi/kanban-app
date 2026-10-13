import { useState } from 'react'
import { purgeCard, purgeColumn, restoreCard, restoreColumn } from '../../lib/archive'
import { formatDateTime } from '../../lib/dates'
import { db } from '../../lib/firebase'
import { compareByOrder, orderAt } from '../../lib/order'
import type { Card, Column } from '../../types'

interface ArchivePanelProps {
  boardId: string
  uid: string
  isOwner: boolean
  columns: Column[]
  cards: Card[]
  onSaveError: () => void
  onClose: () => void
}

function byArchivedAtDesc(a: { archivedAt: Date | null }, b: { archivedAt: Date | null }) {
  return (b.archivedAt?.getTime() ?? 0) - (a.archivedAt?.getTime() ?? 0)
}

// アーカイブ一覧（S-05）。元に戻す（F-72）と、オーナーによる完全削除（F-73）
export function ArchivePanel({ boardId, uid, isOwner, columns, cards, onSaveError, onClose }: ArchivePanelProps) {
  // 完全削除の途中のもの。二重に押されないようにする
  const [purgingIds, setPurgingIds] = useState<string[]>([])
  // 元の列がアーカイブ済み・削除済みのカードの、戻し先として選んだ列
  const [restoreTargets, setRestoreTargets] = useState<Record<string, string>>({})

  const activeColumns = columns.filter((column) => !column.archived).sort(compareByOrder)
  const archivedColumns = columns.filter((column) => column.archived).sort(byArchivedAtDesc)
  const archivedCards = cards.filter((card) => card.archived).sort(byArchivedAtDesc)

  function run(action: Promise<void>) {
    action.catch((error) => {
      console.error(error)
      onSaveError()
    })
  }

  function handleRestoreCard(card: Card, columnId: string) {
    const columnCards = cards.filter((c) => c.columnId === columnId && !c.archived).sort(compareByOrder)
    run(restoreCard(db, boardId, uid, card.id, { columnId, order: orderAt(columnCards, columnCards.length) }))
  }

  function handlePurge(id: string, message: string, purge: () => Promise<void>) {
    if (!window.confirm(message)) return
    setPurgingIds((ids) => [...ids, id])
    purge()
      .catch((error) => {
        console.error(error)
        onSaveError()
      })
      .finally(() => setPurgingIds((ids) => ids.filter((i) => i !== id)))
  }

  return (
    <aside className="archive-panel" aria-label="アーカイブ一覧">
      <header className="archive-panel-header">
        <h2>アーカイブ</h2>
        <button type="button" className="button-icon" onClick={onClose} aria-label="アーカイブ一覧を閉じる">✕</button>
      </header>

      <section>
        <h3>列</h3>
        {archivedColumns.length === 0 && <p className="hint">アーカイブした列はありません。</p>}
        <ul className="archive-list">
          {archivedColumns.map((column) => {
            const cardCount = cards.filter((card) => card.columnId === column.id && !card.archived).length
            return (
              <li key={column.id}>
                <div className="archive-item-title">{column.name}</div>
                <div className="hint">
                  カード {cardCount} 枚{column.archivedAt && ` ・ ${formatDateTime(column.archivedAt)}`}
                </div>
                <div className="archive-item-actions">
                  <button type="button" className="button-secondary" onClick={() => run(restoreColumn(db, boardId, column.id))}>
                    元に戻す
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      className="button-icon"
                      disabled={purgingIds.includes(column.id)}
                      onClick={() => handlePurge(
                        column.id,
                        `列「${column.name}」を、中のカード ${cardCount} 枚ごと完全に削除しますか？\n元に戻せません。`,
                        () => purgeColumn(db, boardId, column.id),
                      )}
                    >
                      {purgingIds.includes(column.id) ? '削除しています…' : '完全に削除'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h3>カード</h3>
        {archivedCards.length === 0 && <p className="hint">アーカイブしたカードはありません。</p>}
        <ul className="archive-list">
          {archivedCards.map((card) => {
            const originalColumn = activeColumns.find((column) => column.id === card.columnId)
            const target = restoreTargets[card.id] ?? activeColumns[0]?.id
            return (
              <li key={card.id}>
                <div className="archive-item-title">{card.title}</div>
                <div className="hint">
                  {originalColumn ? `列：${originalColumn.name}` : '元の列はアーカイブ済みか削除済み'}
                  {card.archivedAt && ` ・ ${formatDateTime(card.archivedAt)}`}
                </div>
                <div className="archive-item-actions">
                  {originalColumn ? (
                    <button type="button" className="button-secondary" onClick={() => handleRestoreCard(card, originalColumn.id)}>
                      元に戻す
                    </button>
                  ) : activeColumns.length > 0 ? (
                    <>
                      <select
                        aria-label={`「${card.title}」の戻し先の列`}
                        value={target}
                        onChange={(event) => setRestoreTargets({ ...restoreTargets, [card.id]: event.target.value })}
                      >
                        {activeColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
                      </select>
                      <button type="button" className="button-secondary" onClick={() => handleRestoreCard(card, target)}>
                        この列に戻す
                      </button>
                    </>
                  ) : (
                    <span className="hint">戻し先の列がありません</span>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      className="button-icon"
                      disabled={purgingIds.includes(card.id)}
                      onClick={() => handlePurge(
                        card.id,
                        `カード「${card.title}」を、コメント・変更履歴ごと完全に削除しますか？\n元に戻せません。`,
                        () => purgeCard(db, boardId, card.id),
                      )}
                    >
                      {purgingIds.includes(card.id) ? '削除しています…' : '完全に削除'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}
