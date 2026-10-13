import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/context'
import { BOARD_NAME_MAX_LENGTH, createBoard, subscribeMyBoards } from '../lib/boards'
import { db } from '../lib/firebase'
import type { BoardSummary } from '../types'

export function BoardListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<BoardSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(false)

  useEffect(() => {
    if (!user) return
    return subscribeMyBoards(db, user.uid, setBoards, (error) => {
      console.error(error)
      setLoadError(true)
    })
  }, [user])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    const name = newBoardName.trim()
    if (!user || !name) return

    setCreating(true)
    setCreateError(false)
    try {
      const boardId = await createBoard(db, user.uid, name)
      navigate(`/b/${boardId}`)
    } catch (error) {
      console.error(error)
      setCreateError(true)
      setCreating(false)
    }
  }

  return (
    <main className="page">
      <h1>ボード一覧</h1>

      <form className="inline-form" onSubmit={handleCreate}>
        <input
          type="text"
          aria-label="新しいボードの名前"
          placeholder="新しいボードの名前"
          value={newBoardName}
          maxLength={BOARD_NAME_MAX_LENGTH}
          onChange={(event) => setNewBoardName(event.target.value)}
          disabled={creating}
        />
        <button type="submit" className="button-primary" disabled={creating || !newBoardName.trim()}>
          ボードを作成
        </button>
      </form>
      {createError && <p className="error-message" role="alert">ボードを作成できませんでした。もう一度お試しください。</p>}

      {loadError && <p className="error-message" role="alert">ボードの一覧を読み込めませんでした。ページを再読み込みしてください。</p>}
      {!loadError && boards === null && <p className="page-message">読み込み中…</p>}
      {boards?.length === 0 && (
        <p className="page-message">参加しているボードはまだありません。上のフォームから作成するか、招待リンクから参加してください。</p>
      )}
      {boards && boards.length > 0 && (
        <ul className="board-list">
          {boards.map((board) => (
            <li key={board.id}>
              <Link to={`/b/${board.id}`} className="board-list-item">
                <span>{board.name}</span>
                {board.role === 'owner' && <span className="badge">オーナー</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
