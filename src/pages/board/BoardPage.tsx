import { useMemo, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { useAuth } from '../../auth/context'
import { Avatar } from '../../components/Avatar'
import { todayString } from '../../lib/dates'
import { EMPTY_FILTER, matchesCardFilter, type CardFilter } from '../../lib/filter'
import { ArchivePanel } from './ArchivePanel'
import { BoardCanvas } from './BoardCanvas'
import type { BoardOutletContext } from './boardOutlet'
import { FilterBar } from './FilterBar'
import { useBoardData } from './useBoardData'

// ボードを切り替えたら、購読も画面の状態もすべて作り直す
export function BoardRoute() {
  const { boardId } = useParams()
  return <BoardPage key={boardId} boardId={boardId!} />
}

function BoardPage({ boardId }: { boardId: string }) {
  const { user } = useAuth()
  const { board, columns, cards, members, error } = useBoardData(boardId)
  const [saveError, setSaveError] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  // 絞り込みの条件は自分の画面だけに効き、保存しない（F-83）
  const [filter, setFilter] = useState<CardFilter>(EMPTY_FILTER)

  const today = todayString()
  const cardFilter = useMemo(
    () => (card: Parameters<typeof matchesCardFilter>[0]) => matchesCardFilter(card, filter, today),
    [filter, today],
  )

  if (error === 'not-found' || error === 'forbidden') {
    return (
      <main className="page">
        <h1>ボードを表示できません</h1>
        <p>ボードが削除されたか、このボードに参加していません。参加するには、ボードのオーナーに招待リンクをもらってください。</p>
        <Link to="/">ボード一覧に戻る</Link>
      </main>
    )
  }
  if (error === 'unknown') {
    return <p className="page-message error-message" role="alert">ボードを読み込めませんでした。ページを再読み込みしてください。</p>
  }
  if (!board || !columns || !cards || !members) {
    return <p className="page-message">読み込み中…</p>
  }

  const isOwner = members.find((member) => member.uid === user?.uid)?.role === 'owner'
  const activeColumnIds = new Set(columns.filter((column) => !column.archived).map((column) => column.id))
  const activeCards = cards.filter((card) => !card.archived && activeColumnIds.has(card.columnId))
  const shownCount = activeCards.filter(cardFilter).length

  return (
    <div className="board-page">
      <header className="board-header">
        <h1>{board.name}</h1>
        <div className="board-members">
          {members.map((member) => (
            <Avatar key={member.uid} name={member.displayName} photoURL={member.photoURL} />
          ))}
        </div>
        <FilterBar
          filter={filter}
          onChange={setFilter}
          members={members}
          labels={board.labels}
          shownCount={shownCount}
          totalCount={activeCards.length}
        />
        <div className="board-header-actions">
          <button
            type="button"
            className="button-secondary"
            aria-expanded={archiveOpen}
            onClick={() => setArchiveOpen(!archiveOpen)}
          >
            アーカイブ
          </button>
          <Link to="settings" className="button-secondary board-settings-link">ボード設定</Link>
        </div>
      </header>

      {saveError && (
        <div className="error-banner" role="alert">
          変更を保存できませんでした。通信状態を確認して、もう一度お試しください。
          <button type="button" className="button-icon" onClick={() => setSaveError(false)}>閉じる</button>
        </div>
      )}

      <div className="board-body">
        <BoardCanvas
          board={board}
          columns={columns}
          cards={cards}
          members={members}
          cardFilter={cardFilter}
          onSaveError={() => setSaveError(true)}
        />
        {archiveOpen && (
          <ArchivePanel
            boardId={board.id}
            uid={user!.uid}
            isOwner={isOwner}
            columns={columns}
            cards={cards}
            onSaveError={() => setSaveError(true)}
            onClose={() => setArchiveOpen(false)}
          />
        )}
      </div>

      {/* カード詳細（S-04）はボードの上にモーダルで開く */}
      <Outlet context={{ board, columns, cards, members, onSaveError: () => setSaveError(true) } satisfies BoardOutletContext} />
    </div>
  )
}
