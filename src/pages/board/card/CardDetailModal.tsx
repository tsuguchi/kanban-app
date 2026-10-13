import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../../auth/context'
import { archiveCard, updateCard, type EditableCardFields, type HistoryRecord } from '../../../lib/card'
import { db } from '../../../lib/firebase'
import type { Card } from '../../../types'
import { useBoardOutlet, type BoardOutletContext } from '../boardOutlet'
import { CardComments } from './CardComments'
import { CardHistory } from './CardHistory'
import { AssigneePicker, DescriptionEditor, DueDateEditor, LabelPicker, TitleEditor } from './CardFields'
import { ChecklistEditor } from './ChecklistEditor'

// カードを切り替えたら、編集中の状態もすべて作り直す
export function CardDetailRoute() {
  const { cardId } = useParams()
  return <CardDetailModal key={cardId} cardId={cardId!} {...useBoardOutlet()} />
}

// カード詳細（S-04）。ボードの上にモーダルで開く。URL を共有すれば同じカードを開ける
function CardDetailModal({ cardId, board, columns, cards, members, onSaveError }: BoardOutletContext & { cardId: string }) {
  const { user } = useAuth()
  const uid = user!.uid
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const card = cards.find((c) => c.id === cardId)

  // <dialog> のモーダル表示にすると、Esc で閉じる・背後を操作できなくする・フォーカスの移動をブラウザが行う
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const close = () => navigate(`/b/${board.id}`)

  function save(fields: EditableCardFields, history?: HistoryRecord) {
    updateCard(db, board.id, uid, cardId, fields, history).catch((error) => {
      console.error(error)
      onSaveError()
    })
  }

  const memberNames = (ids: string[]) =>
    ids.map((id) => members.find((member) => member.uid === id)?.displayName ?? '退出したメンバー')
  const labelNames = (ids: string[]) =>
    ids.flatMap((id) => board.labels.find((label) => label.id === id)?.name ?? [])

  function handleArchive(target: Card) {
    if (!window.confirm(`カード「${target.title}」をアーカイブしますか？\nアーカイブ一覧から元に戻せます。`)) return
    archiveCard(db, board.id, uid, target.id).catch((error) => {
      console.error(error)
      onSaveError()
    })
    close()
  }

  return (
    <dialog
      ref={dialogRef}
      className="card-dialog"
      aria-label={card?.title ?? 'カード'}
      onClose={close}
      // 背景（ダイアログの外側）をクリックしたら閉じる
      onClick={(event) => {
        if (event.target === dialogRef.current) close()
      }}
    >
      <div className="card-dialog-content">
        <button type="button" className="button-icon card-dialog-close" onClick={close} aria-label="閉じる">✕</button>

        {!card || card.archived ? (
          <p className="page-message">
            {card ? 'このカードはアーカイブされています。アーカイブ一覧から元に戻せます。' : 'カードが見つかりません。削除された可能性があります。'}
          </p>
        ) : (
          <>
            <TitleEditor
              title={card.title}
              onSave={(title) => save({ title }, { type: 'title_changed', from: { title: card.title }, to: { title } })}
            />
            <p className="hint">
              列：{columns.find((column) => column.id === card.columnId)?.name ?? '（不明）'}
            </p>

            <div className="card-dialog-layout">
              <div className="card-dialog-main">
                <section className="card-detail-section">
                  <h3>説明</h3>
                  <DescriptionEditor description={card.description} onSave={(description) => save({ description })} />
                </section>

                <section className="card-detail-section">
                  <h3>チェックリスト</h3>
                  <ChecklistEditor items={card.checklist} onSave={(checklist) => save({ checklist })} />
                </section>

                <CardComments boardId={board.id} cardId={card.id} uid={uid} members={members} onSaveError={onSaveError} />
                <CardHistory boardId={board.id} cardId={card.id} members={members} />
              </div>

              <aside className="card-dialog-side">
                <section className="card-detail-section">
                  <h3>期限</h3>
                  <DueDateEditor
                    dueDate={card.dueDate}
                    onSave={(dueDate) => save({ dueDate }, {
                      type: 'due_changed', from: { dueDate: card.dueDate }, to: { dueDate },
                    })}
                  />
                </section>

                <section className="card-detail-section">
                  <h3>担当者</h3>
                  <AssigneePicker
                    assigneeIds={card.assigneeIds}
                    members={members}
                    onSave={(assigneeIds) => save({ assigneeIds }, {
                      type: 'assignees_changed',
                      from: { names: memberNames(card.assigneeIds) },
                      to: { names: memberNames(assigneeIds) },
                    })}
                  />
                </section>

                <section className="card-detail-section">
                  <h3>ラベル</h3>
                  <LabelPicker
                    boardId={board.id}
                    labelIds={card.labelIds}
                    labels={board.labels}
                    onSave={(labelIds) => save({ labelIds }, {
                      type: 'labels_changed',
                      from: { names: labelNames(card.labelIds) },
                      to: { names: labelNames(labelIds) },
                    })}
                  />
                </section>

                <section className="card-detail-section">
                  <button type="button" className="button-secondary" onClick={() => handleArchive(card)}>
                    カードをアーカイブ
                  </button>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
