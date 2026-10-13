import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/context'
import { getInvite, getMyRole, isInviteActive, joinBoard } from '../lib/boardSettings'
import { db } from '../lib/firebase'

type InviteState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'expired', boardName: string }
  | { status: 'ready', boardName: string }
  | { status: 'joining', boardName: string }
  | { status: 'error' }

// 招待への参加（S-07）。未ログインなら RequireAuth がログイン画面を経由させる
export function InvitePage() {
  const { boardId, inviteId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<InviteState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      // すでにメンバーなら、そのままボードを開く
      if (await getMyRole(db, boardId!, user!.uid)) {
        if (!cancelled) navigate(`/b/${boardId}`, { replace: true })
        return
      }
      const invite = await getInvite(db, boardId!, inviteId!)
      if (cancelled) return
      if (!invite) setState({ status: 'invalid' })
      else if (!isInviteActive(invite)) setState({ status: 'expired', boardName: invite.boardName })
      else setState({ status: 'ready', boardName: invite.boardName })
    }
    load().catch((error) => {
      console.error(error)
      if (!cancelled) setState({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [boardId, inviteId, user, navigate])

  async function handleJoin(boardName: string) {
    setState({ status: 'joining', boardName })
    try {
      await joinBoard(db, boardId!, user!.uid, inviteId!)
      navigate(`/b/${boardId}`, { replace: true })
    } catch (error) {
      // 表示してから参加するまでの間に、リンクが無効化されたり期限が切れたりした場合
      console.error(error)
      setState({ status: 'expired', boardName })
    }
  }

  return (
    <main className="page invite-page">
      <h1>ボードへの招待</h1>
      {state.status === 'loading' && <p className="page-message">招待を確認しています…</p>}
      {state.status === 'invalid' && <p>この招待リンクは無効です。リンクが正しいか、ボードのオーナーに確認してください。</p>}
      {state.status === 'expired' && (
        <p>「{state.boardName}」への招待リンクは、有効期限が切れたか無効にされています。ボードのオーナーに新しいリンクをもらってください。</p>
      )}
      {state.status === 'error' && <p className="error-message" role="alert">招待を確認できませんでした。ページを再読み込みしてください。</p>}
      {(state.status === 'ready' || state.status === 'joining') && (
        <>
          <p>「<strong>{state.boardName}</strong>」に招待されています。</p>
          <button
            type="button"
            className="button-primary"
            disabled={state.status === 'joining'}
            onClick={() => handleJoin(state.boardName)}
          >
            参加する
          </button>
        </>
      )}
      <p><Link to="/">ボード一覧へ</Link></p>
    </main>
  )
}
