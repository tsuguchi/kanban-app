import { FirebaseError } from 'firebase/app'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/context'
import { Avatar } from '../../components/Avatar'
import { subscribeBoard, subscribeMembers } from '../../lib/board'
import { deleteBoard, removeMember, renameBoard, updateLabels } from '../../lib/boardSettings'
import { BOARD_NAME_MAX_LENGTH } from '../../lib/boards'
import { db } from '../../lib/firebase'
import type { Board, BoardMember } from '../../types'
import { InviteSettings } from './InviteSettings'
import { LabelSettings } from './LabelSettings'

// ボードを切り替えたら、購読も画面の状態もすべて作り直す
export function BoardSettingsRoute() {
  const { boardId } = useParams()
  return <BoardSettingsPage key={boardId} boardId={boardId!} />
}

// ボード設定（S-06）。オーナー以外には、ラベルの編集と「ボードを抜ける」だけを表示する
function BoardSettingsPage({ boardId }: { boardId: string }) {
  const { user } = useAuth()
  const uid = user!.uid
  const navigate = useNavigate()
  const [board, setBoard] = useState<Board | null>(null)
  const [members, setMembers] = useState<BoardMember[] | null>(null)
  const [loadError, setLoadError] = useState<'unavailable' | 'unknown' | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [leavingOrDeleting, setLeavingOrDeleting] = useState<'leaving' | 'deleting' | null>(null)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')

  const handleSaveError = useCallback(() => setSaveError(true), [])

  useEffect(() => {
    function handleError(error: Error) {
      if (error instanceof FirebaseError && error.code === 'permission-denied') {
        setLoadError('unavailable')
      } else {
        console.error(error)
        setLoadError('unknown')
      }
    }
    const unsubscribes = [
      subscribeBoard(db, boardId, (nextBoard) => {
        setBoard(nextBoard)
        if (!nextBoard) setLoadError('unavailable')
      }, handleError),
      subscribeMembers(db, boardId, setMembers, handleError),
    ]
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [boardId])

  function save(action: Promise<void>) {
    action.catch((error) => {
      console.error(error)
      setSaveError(true)
    })
  }

  // 抜ける・削除するの途中で購読が切れても、その旨を表示し続ける
  if (leavingOrDeleting === 'deleting') return <p className="page-message">ボードを削除しています…</p>
  if (leavingOrDeleting === 'leaving') return <p className="page-message">ボードから抜けています…</p>
  if (loadError === 'unavailable') {
    return (
      <main className="page">
        <h1>ボードを表示できません</h1>
        <p>ボードが削除されたか、このボードに参加していません。</p>
        <Link to="/">ボード一覧に戻る</Link>
      </main>
    )
  }
  if (loadError === 'unknown') {
    return <p className="page-message error-message" role="alert">ボードを読み込めませんでした。ページを再読み込みしてください。</p>
  }
  if (!board || !members) return <p className="page-message">読み込み中…</p>

  const isOwner = members.find((member) => member.uid === uid)?.role === 'owner'
  const boardName = draftName ?? board.name

  function handleRename(event: FormEvent) {
    event.preventDefault()
    const name = boardName.trim()
    if (name && name !== board!.name) save(renameBoard(db, boardId, name))
    setDraftName(null)
  }

  function handleRemove(member: BoardMember) {
    if (window.confirm(`${member.displayName} さんをこのボードから外しますか？`)) save(removeMember(db, boardId, member.uid))
  }

  async function handleLeave() {
    if (!window.confirm('このボードから抜けますか？\nもう一度参加するには、オーナーから招待リンクをもらう必要があります。')) return
    setLeavingOrDeleting('leaving')
    try {
      await removeMember(db, boardId, uid)
      navigate('/', { replace: true })
    } catch (error) {
      console.error(error)
      setLeavingOrDeleting(null)
      setSaveError(true)
    }
  }

  async function handleDelete(event: FormEvent) {
    event.preventDefault()
    if (deleteConfirmation !== board!.name) return
    setLeavingOrDeleting('deleting')
    try {
      await deleteBoard(db, boardId, uid)
    } catch (error) {
      // ボード本体を消したあとの片付けに失敗しても、次にボード一覧を開いたときに続きを行う
      console.error(error)
    }
    navigate('/', { replace: true })
  }

  return (
    <main className="page">
      <p><Link to={`/b/${boardId}`}>← {board.name} に戻る</Link></p>
      <h1>ボード設定</h1>

      {saveError && (
        <div className="error-banner" role="alert">
          変更を保存できませんでした。通信状態を確認して、もう一度お試しください。
          <button type="button" className="button-icon" onClick={() => setSaveError(false)}>閉じる</button>
        </div>
      )}

      {isOwner && (
        <section className="settings-section">
          <h2>ボード名</h2>
          <form className="inline-form" onSubmit={handleRename}>
            <input
              type="text"
              aria-label="ボード名"
              value={boardName}
              maxLength={BOARD_NAME_MAX_LENGTH}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <button type="submit" className="button-primary" disabled={!boardName.trim() || boardName.trim() === board.name}>
              変更
            </button>
          </form>
        </section>
      )}

      <section className="settings-section">
        <h2>ラベル</h2>
        <LabelSettings labels={board.labels} onSave={(labels) => save(updateLabels(db, boardId, labels))} />
      </section>

      <section className="settings-section">
        <h2>メンバー</h2>
        <ul className="settings-list">
          {members.map((member) => (
            <li key={member.uid}>
              <span className="member-info">
                <Avatar name={member.displayName} photoURL={member.photoURL} />
                {member.displayName}
                {member.uid === uid && '（自分）'}
                {member.role === 'owner' && <span className="badge">オーナー</span>}
              </span>
              {isOwner && member.uid !== uid && (
                <button type="button" className="button-icon" onClick={() => handleRemove(member)}>外す</button>
              )}
            </li>
          ))}
        </ul>
        {!isOwner && (
          <div>
            <button type="button" className="button-secondary" onClick={handleLeave}>ボードを抜ける</button>
          </div>
        )}
      </section>

      {isOwner && (
        <section className="settings-section">
          <h2>招待リンク</h2>
          <InviteSettings board={board} uid={uid} onSaveError={handleSaveError} />
        </section>
      )}

      {isOwner && (
        <section className="settings-section danger-zone">
          <h2>ボードの削除</h2>
          <p className="hint">
            列・カード・コメント・変更履歴をすべて削除します。元に戻せません。
            削除するには、ボード名「{board.name}」を入力してください。
          </p>
          <form className="inline-form" onSubmit={handleDelete}>
            <input
              type="text"
              aria-label="削除するボードの名前"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
            <button type="submit" className="button-danger" disabled={deleteConfirmation !== board.name}>
              ボードを削除
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
