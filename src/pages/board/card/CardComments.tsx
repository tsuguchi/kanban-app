import { useEffect, useState, type FormEvent } from 'react'
import { Avatar } from '../../../components/Avatar'
import {
  addComment,
  COMMENT_MAX_LENGTH,
  deleteComment,
  editComment,
  subscribeComments,
} from '../../../lib/card'
import { formatDateTime } from '../../../lib/dates'
import { db } from '../../../lib/firebase'
import type { BoardMember, CardComment } from '../../../types'

interface CardCommentsProps {
  boardId: string
  cardId: string
  uid: string
  members: BoardMember[]
  onSaveError: () => void
}

// コメント（F-42）。投稿者本人だけが編集・削除できる
export function CardComments({ boardId, cardId, uid, members, onSaveError }: CardCommentsProps) {
  const [comments, setComments] = useState<CardComment[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [editing, setEditing] = useState<{ id: string, body: string } | null>(null)

  useEffect(() => subscribeComments(db, boardId, cardId, setComments, (error) => {
    console.error(error)
    setLoadError(true)
  }), [boardId, cardId])

  function save(action: Promise<void>) {
    action.catch((error) => {
      console.error(error)
      onSaveError()
    })
  }

  function handlePost(event?: FormEvent) {
    event?.preventDefault()
    const body = newBody.trim()
    if (!body) return
    save(addComment(db, boardId, uid, cardId, body))
    setNewBody('')
  }

  function handleDelete(comment: CardComment) {
    if (window.confirm('このコメントを削除しますか？')) save(deleteComment(db, boardId, uid, cardId, comment.id))
  }

  return (
    <section className="card-detail-section">
      <h3>コメント</h3>
      {loadError && <p className="error-message" role="alert">コメントを読み込めませんでした。</p>}
      {comments === null && !loadError && <p className="hint">読み込み中…</p>}
      <ul className="comment-list">
        {comments?.map((comment) => {
          const author = members.find((member) => member.uid === comment.authorId)
          const isEditing = editing?.id === comment.id
          return (
            <li key={comment.id} className="comment">
              <Avatar name={author?.displayName ?? '退出したメンバー'} photoURL={author?.photoURL ?? null} departed={!author} />
              <div className="comment-body">
                <div className="comment-meta">
                  <strong>{author?.displayName ?? '退出したメンバー'}</strong>
                  <span>{formatDateTime(comment.createdAt)}{comment.edited && '（編集済み）'}</span>
                </div>
                {isEditing ? (
                  <>
                    <textarea
                      aria-label="コメントを編集"
                      rows={3}
                      value={editing.body}
                      maxLength={COMMENT_MAX_LENGTH}
                      autoFocus
                      onChange={(event) => setEditing({ id: comment.id, body: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          setEditing(null)
                        }
                      }}
                    />
                    <div className="inline-text-form-actions">
                      <button
                        type="button"
                        className="button-primary"
                        disabled={!editing.body.trim()}
                        onClick={() => {
                          const body = editing.body.trim()
                          if (body !== comment.body) save(editComment(db, boardId, cardId, comment.id, body))
                          setEditing(null)
                        }}
                      >
                        保存
                      </button>
                      <button type="button" className="button-secondary" onClick={() => setEditing(null)}>キャンセル</button>
                    </div>
                  </>
                ) : (
                  <p className="pre-wrap">{comment.body}</p>
                )}
                {comment.authorId === uid && !isEditing && (
                  <div className="comment-actions">
                    <button type="button" className="button-icon" onClick={() => setEditing({ id: comment.id, body: comment.body })}>編集</button>
                    <button type="button" className="button-icon" onClick={() => handleDelete(comment)}>削除</button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <form className="comment-form" onSubmit={handlePost}>
        <textarea
          aria-label="コメントを書く"
          placeholder="コメントを書く（Ctrl+Enter で投稿）"
          rows={3}
          value={newBody}
          maxLength={COMMENT_MAX_LENGTH}
          onChange={(event) => setNewBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) handlePost()
          }}
        />
        <button type="submit" className="button-primary" disabled={!newBody.trim()}>投稿</button>
      </form>
    </section>
  )
}
