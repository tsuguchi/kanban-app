import { useEffect, useState } from 'react'
import {
  createInvite,
  inviteExpiresAt,
  inviteUrl,
  isInviteActive,
  revokeInvite,
  subscribeInvites,
} from '../../lib/boardSettings'
import { formatDateTime } from '../../lib/dates'
import { db } from '../../lib/firebase'
import type { Board, Invite } from '../../types'

interface InviteSettingsProps {
  board: Board
  uid: string
  onSaveError: () => void
}

// 招待リンクの発行・無効化（F-20）。オーナーだけに表示する
export function InviteSettings({ board, uid, onSaveError }: InviteSettingsProps) {
  const [invites, setInvites] = useState<Invite[] | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [issuing, setIssuing] = useState(false)

  useEffect(() => subscribeInvites(db, board.id, setInvites, (error) => {
    console.error(error)
    onSaveError()
  }), [board.id, onSaveError])

  const activeInvites = invites?.filter((invite) => isInviteActive(invite)) ?? []

  async function handleIssue() {
    setIssuing(true)
    try {
      await createInvite(db, board.id, uid, board.name)
    } catch (error) {
      console.error(error)
      onSaveError()
    } finally {
      setIssuing(false)
    }
  }

  async function handleCopy(invite: Invite) {
    try {
      await navigator.clipboard.writeText(inviteUrl(window.location.origin, board.id, invite.id))
      setCopiedId(invite.id)
    } catch (error) {
      console.error(error)
      window.prompt('このリンクをコピーしてください', inviteUrl(window.location.origin, board.id, invite.id))
    }
  }

  function handleRevoke(invite: Invite) {
    if (!window.confirm('この招待リンクを無効にしますか？\nこのリンクではもう参加できなくなります。すでに参加した人はそのまま残ります。')) return
    revokeInvite(db, board.id, invite.id).catch((error) => {
      console.error(error)
      onSaveError()
    })
  }

  return (
    <>
      <p className="hint">リンクを知っている人は、誰でもこのボードにメンバーとして参加できます。リンクの有効期限は発行から 7 日です。</p>
      {invites !== null && activeInvites.length === 0 && <p className="hint">有効な招待リンクはありません。</p>}
      <ul className="settings-list">
        {activeInvites.map((invite) => (
          <li key={invite.id}>
            <span className="invite-info">
              <code className="invite-url">{inviteUrl(window.location.origin, board.id, invite.id)}</code>
              <span className="hint">{formatDateTime(inviteExpiresAt(invite))} まで有効</span>
            </span>
            <span className="settings-list-actions">
              <button type="button" className="button-secondary" onClick={() => handleCopy(invite)}>
                {copiedId === invite.id ? 'コピーしました' : 'コピー'}
              </button>
              <button type="button" className="button-icon" onClick={() => handleRevoke(invite)}>無効にする</button>
            </span>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" className="button-primary" onClick={handleIssue} disabled={issuing}>
          招待リンクを発行
        </button>
      </div>
    </>
  )
}
