import { useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { BoardCanvas } from './BoardCanvas'
import type { BoardOutletContext } from './boardOutlet'
import { useBoardData } from './useBoardData'

// ボードを切り替えたら、購読も画面の状態もすべて作り直す
export function BoardRoute() {
  const { boardId } = useParams()
  return <BoardPage key={boardId} boardId={boardId!} />
}

function BoardPage({ boardId }: { boardId: string }) {
  const { board, columns, cards, members, error } = useBoardData(boardId)
  const [saveError, setSaveError] = useState(false)

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

  return (
    <div className="board-page">
      <header className="board-header">
        <h1>{board.name}</h1>
        <div className="board-members">
          {members.map((member) => (
            <Avatar key={member.uid} name={member.displayName} photoURL={member.photoURL} />
          ))}
        </div>
        <Link to="settings" className="button-secondary board-settings-link">ボード設定</Link>
      </header>

      {saveError && (
        <div className="error-banner" role="alert">
          変更を保存できませんでした。通信状態を確認して、もう一度お試しください。
          <button type="button" className="button-icon" onClick={() => setSaveError(false)}>閉じる</button>
        </div>
      )}

      <BoardCanvas
        board={board}
        columns={columns}
        cards={cards}
        members={members}
        onSaveError={() => setSaveError(true)}
      />

      {/* カード詳細（S-04）はボードの上にモーダルで開く */}
      <Outlet context={{ board, columns, cards, members, onSaveError: () => setSaveError(true) } satisfies BoardOutletContext} />
    </div>
  )
}
